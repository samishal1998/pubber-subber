import {
  type MessageAttributeValue,
  PublishCommand,
  SNSClient,
  type SNSClientConfig,
} from '@aws-sdk/client-sns';
import { type Codec, NotSupportedError, type PubSubAdapter, jsonCodec } from '@pubber-subber/core';

export interface AwsSnsAdapterOptions {
  region?: string;
  /** Default TopicArn used when `topic` isn't already an ARN and no meta override is passed. */
  topicArn?: string;
  client?: SNSClient;
  options?: SNSClientConfig;
  /** Payload codec. Default: JSON. */
  codec?: Codec;
}

export interface AwsSnsPublishMeta {
  topicArn?: string;
  targetArn?: string;
  phoneNumber?: string;
  messageAttributes?: Record<string, MessageAttributeValue>;
  messageGroupId?: string;
  messageDeduplicationId?: string;
  subject?: string;
}

const ARN_PREFIX = 'arn:aws:sns:';

export function awsSns(
  opts: AwsSnsAdapterOptions = {},
): PubSubAdapter<AwsSnsPublishMeta, never, never> {
  const codec = opts.codec ?? jsonCodec();
  let client: SNSClient | null = null;

  const ensure = (): SNSClient => {
    if (client) return client;
    if (opts.client) {
      client = opts.client;
    } else {
      client = new SNSClient({ region: opts.region, ...opts.options });
    }
    return client;
  };

  return {
    name: 'aws-sns',
    capabilities: { publish: true, subscribe: false, patternSubscribe: false, ack: false },

    async connect() {
      ensure();
    },

    async disconnect() {
      if (client) client.destroy();
      client = null;
    },

    async publish(topic, payload, meta) {
      const c = ensure();
      const topicArn = meta?.topicArn ?? (topic.startsWith(ARN_PREFIX) ? topic : opts.topicArn);
      const encoded = codec.encode(payload);
      const message = typeof encoded === 'string' ? encoded : Buffer.from(encoded).toString('utf8');

      await c.send(
        new PublishCommand({
          Message: message,
          TopicArn: topicArn,
          TargetArn: meta?.targetArn,
          PhoneNumber: meta?.phoneNumber,
          MessageAttributes: meta?.messageAttributes,
          MessageGroupId: meta?.messageGroupId,
          MessageDeduplicationId: meta?.messageDeduplicationId,
          Subject: meta?.subject,
        }),
      );
    },

    async subscribe() {
      throw new NotSupportedError(
        'aws-sns is publish-only. Use `compose({ publisher: awsSns(), subscriber: awsSqs() })` ' +
          'from @pubber-subber/core to receive messages via SQS, or another subscribe-capable adapter.',
      );
    },
  };
}
