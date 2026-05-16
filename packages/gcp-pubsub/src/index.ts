import {
  type ClientConfig,
  type CreateSubscriptionOptions,
  PubSub as GooglePubSub,
  type Message,
  type Subscription,
} from '@google-cloud/pubsub';
import {
  type AdapterMessage,
  type Codec,
  type PubSubAdapter,
  SubscriptionError,
  jsonCodec,
} from '@pubber-subber/core';

export interface GcpPubSubAdapterOptions {
  projectId?: string;
  /** Or pass a fully-constructed client. */
  client?: GooglePubSub;
  /** Or `ClientConfig` for the underlying SDK. */
  options?: ClientConfig;
  /** Payload codec. Default: JSON. */
  codec?: Codec;
  /** Prefix for auto-generated subscription names. Default: `pubber`. */
  subscriptionPrefix?: string;
}

export interface GcpPublishMeta {
  attributes?: Record<string, string>;
  orderingKey?: string;
}

export interface GcpSubscribeMeta {
  /** Existing subscription name. If omitted, a unique name is generated. */
  subscriptionName?: string;
  /** Create the subscription if it doesn't exist. */
  createIfMissing?: boolean;
  /** Subscription options used when `createIfMissing` is true. */
  subscriptionOptions?: CreateSubscriptionOptions;
  /** Delete the subscription when the handle is unsubscribed. Best for dev. */
  ephemeral?: boolean;
}

export function gcpPubSub(
  opts: GcpPubSubAdapterOptions = {},
): PubSubAdapter<GcpPublishMeta, GcpSubscribeMeta> {
  const codec = opts.codec ?? jsonCodec();
  let client: GooglePubSub | null = null;
  let idCounter = 0;
  const liveSubscriptions = new Set<Subscription>();

  const ensure = (): GooglePubSub => {
    if (client) return client;
    if (opts.client) {
      client = opts.client;
    } else {
      client = new GooglePubSub({ projectId: opts.projectId, ...opts.options });
    }
    return client;
  };

  return {
    name: 'gcp-pubsub',
    capabilities: { publish: true, subscribe: true, patternSubscribe: false, ack: true },

    async connect() {
      ensure();
    },

    async disconnect() {
      for (const s of [...liveSubscriptions]) {
        await s.close().catch(noop);
      }
      liveSubscriptions.clear();
      if (client) {
        await client.close().catch(noop);
        client = null;
      }
    },

    async publish(topic, payload, meta) {
      const c = ensure();
      const t = c.topic(topic);
      const encoded = codec.encode(payload);
      const data =
        typeof encoded === 'string' ? Buffer.from(encoded, 'utf8') : Buffer.from(encoded);
      await t.publishMessage({
        data,
        attributes: meta?.attributes,
        orderingKey: meta?.orderingKey,
      });
    },

    async subscribe(topic, handler, meta) {
      const c = ensure();
      const prefix = opts.subscriptionPrefix ?? 'pubber';
      const subName =
        meta?.subscriptionName ??
        `${prefix}-${sanitize(topic)}-${process.pid}-${Date.now()}-${++idCounter}`;
      let subscription = c.subscription(subName);

      if (meta?.createIfMissing) {
        const [exists] = await subscription.exists();
        if (!exists) {
          try {
            await c.topic(topic).createSubscription(subName, meta.subscriptionOptions);
          } catch (err) {
            throw new SubscriptionError(
              `Failed to create subscription "${subName}" on topic "${topic}"`,
              { cause: err },
            );
          }
          subscription = c.subscription(subName);
        }
      }

      const onMessage = async (message: Message) => {
        let payload: unknown = message.data;
        try {
          payload = codec.decode(message.data);
        } catch {
          // Leave as raw buffer.
        }
        let resolved = false;
        const adapterMsg: AdapterMessage = {
          topic,
          payload,
          raw: message,
          meta: {
            attributes: message.attributes,
            messageId: message.id,
            publishTime: message.publishTime,
            orderingKey: message.orderingKey,
          },
          ack: async () => {
            if (resolved) return;
            resolved = true;
            message.ack();
          },
          nack: async () => {
            if (resolved) return;
            resolved = true;
            message.nack();
          },
        };
        try {
          await handler(adapterMsg);
          if (!resolved) {
            resolved = true;
            message.ack();
          }
        } catch {
          if (!resolved) {
            resolved = true;
            message.nack();
          }
        }
      };

      subscription.on('message', onMessage);
      liveSubscriptions.add(subscription);

      idCounter += 1;
      const id = `gcp-${idCounter}`;
      return {
        id,
        topic,
        unsubscribe: async () => {
          subscription.off('message', onMessage);
          await subscription.close().catch(noop);
          liveSubscriptions.delete(subscription);
          if (meta?.ephemeral) {
            await subscription.delete().catch(noop);
          }
        },
      };
    },
  };
}

function sanitize(name: string): string {
  // GCP subscription names must match [a-zA-Z][a-zA-Z0-9_\-.~+%]{2,254}
  return name.replace(/[^a-zA-Z0-9_\-.~+%]/g, '-').slice(0, 80);
}

function noop(): void {
  // intentional
}
