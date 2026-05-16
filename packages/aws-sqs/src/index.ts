import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type SQSClientConfig,
  type Message as SqsMessage,
} from '@aws-sdk/client-sqs';
import {
  type AdapterMessage,
  type Codec,
  NotSupportedError,
  type PubSubAdapter,
  SubscriptionError,
  jsonCodec,
} from '@pubber-subber/core';

export interface AwsSqsAdapterOptions {
  region?: string;
  /** Default queue URL, used when no `meta.queueUrl` is provided on subscribe. */
  queueUrl?: string;
  client?: SQSClient;
  options?: SQSClientConfig;
  codec?: Codec;
}

export interface AwsSqsSubscribeMeta {
  queueUrl?: string;
  /** 0–20s. Default 20 (long polling). */
  waitTimeSeconds?: number;
  /** 1–10 per ReceiveMessage call. Default 10. */
  maxMessages?: number;
  /** Override the queue's default visibility timeout for received messages. */
  visibilityTimeout?: number;
  /** Max number of handler invocations in flight at once. Default 5. */
  handlerConcurrency?: number;
}

export function awsSqs(opts: AwsSqsAdapterOptions = {}): PubSubAdapter<never, AwsSqsSubscribeMeta> {
  const codec = opts.codec ?? jsonCodec();
  let client: SQSClient | null = null;
  let idCounter = 0;

  const ensure = (): SQSClient => {
    if (client) return client;
    if (opts.client) {
      client = opts.client;
    } else {
      client = new SQSClient({ region: opts.region, ...opts.options });
    }
    return client;
  };

  return {
    name: 'aws-sqs',
    capabilities: { publish: false, subscribe: true, patternSubscribe: false, ack: true },

    async connect() {
      ensure();
    },

    async disconnect() {
      if (client) client.destroy();
      client = null;
    },

    async publish() {
      throw new NotSupportedError(
        'aws-sqs is subscribe-only. Use @pubber-subber/aws-sns (or another publish-capable adapter) ' +
          'and compose them: `compose({ publisher: awsSns(), subscriber: awsSqs() })`.',
      );
    },

    async subscribe(topic, handler, meta) {
      const c = ensure();
      const queueUrl = meta?.queueUrl ?? opts.queueUrl;
      if (!queueUrl) {
        throw new SubscriptionError(
          'queueUrl is required (pass it in awsSqs({ queueUrl }) or meta.queueUrl).',
        );
      }
      const waitTimeSeconds = meta?.waitTimeSeconds ?? 20;
      const maxMessages = meta?.maxMessages ?? 10;
      const concurrency = meta?.handlerConcurrency ?? 5;
      const visibilityTimeout = meta?.visibilityTimeout;

      let stopped = false;
      const semaphore = new Semaphore(concurrency);
      const inflight = new Set<Promise<unknown>>();

      const loop = async (): Promise<void> => {
        while (!stopped) {
          try {
            const resp = await c.send(
              new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: maxMessages,
                WaitTimeSeconds: waitTimeSeconds,
                VisibilityTimeout: visibilityTimeout,
                MessageAttributeNames: ['All'],
                MessageSystemAttributeNames: ['All'] as never,
              }),
            );
            for (const m of resp.Messages ?? []) {
              if (stopped) break;
              await semaphore.acquire();
              const task = processMessage(c, queueUrl, topic, m, handler, codec).finally(() => {
                semaphore.release();
                inflight.delete(task);
              });
              inflight.add(task);
            }
          } catch (err) {
            if (stopped) break;
            // Backoff briefly on receive errors so we don't hot-loop on a permission issue.
            await sleep(1000);
          }
        }
      };

      void loop();

      idCounter += 1;
      const id = `sqs-${idCounter}`;
      return {
        id,
        topic,
        unsubscribe: async () => {
          stopped = true;
          await Promise.allSettled([...inflight]);
        },
      };
    },
  };
}

async function processMessage(
  client: SQSClient,
  queueUrl: string,
  topic: string,
  message: SqsMessage,
  handler: (msg: AdapterMessage) => void | Promise<void>,
  codec: Codec,
): Promise<void> {
  const body = message.Body;
  let payload: unknown = body;
  let snsAttributes: Record<string, unknown> | undefined;

  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.Type === 'Notification' &&
        typeof parsed.Message === 'string'
      ) {
        // SNS→SQS envelope. Unwrap.
        snsAttributes = parsed.MessageAttributes;
        try {
          payload = codec.decode(parsed.Message);
        } catch {
          payload = parsed.Message;
        }
      } else {
        payload = codec.decode(body);
      }
    } catch {
      payload = body;
    }
  }

  const receiptHandle = message.ReceiptHandle ?? '';
  let resolved = false;
  const doAck = async (): Promise<void> => {
    if (resolved) return;
    resolved = true;
    await client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  };
  const doNack = async (): Promise<void> => {
    if (resolved) return;
    resolved = true;
    await client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 0,
      }),
    );
  };

  const adapterMsg: AdapterMessage = {
    topic,
    payload,
    raw: message,
    meta: {
      messageId: message.MessageId,
      receiptHandle: message.ReceiptHandle,
      attributes: message.MessageAttributes,
      systemAttributes: message.Attributes,
      snsAttributes,
    },
    ack: doAck,
    nack: doNack,
  };

  try {
    await handler(adapterMsg);
    await doAck();
  } catch {
    await doNack().catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class Semaphore {
  #permits: number;
  #waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.#permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.#permits > 0) {
      this.#permits -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.#waiters.push(resolve));
    this.#permits -= 1;
  }

  release(): void {
    this.#permits += 1;
    const next = this.#waiters.shift();
    if (next) next();
  }
}
