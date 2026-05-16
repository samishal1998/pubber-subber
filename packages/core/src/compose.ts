import type {
  AnyAdapter,
  PubSubAdapter,
  PublishMetaOf,
  SubscribeMetaOf,
  UnsubscribeMetaOf,
} from './adapter';
import { NotSupportedError } from './errors';

export interface ComposeOptions<P extends AnyAdapter, S extends AnyAdapter> {
  publisher: P;
  subscriber: S;
  name?: string;
}

/**
 * Combine a publish-capable adapter with a subscribe-capable adapter into one.
 * The classic use case is AWS: SNS for `publish`, SQS for `subscribe`.
 */
export function compose<P extends AnyAdapter, S extends AnyAdapter>(
  opts: ComposeOptions<P, S>,
): PubSubAdapter<PublishMetaOf<P>, SubscribeMetaOf<S>, UnsubscribeMetaOf<S>> {
  const { publisher, subscriber, name = `composed(${publisher.name}+${subscriber.name})` } = opts;

  return {
    name,
    capabilities: {
      publish: publisher.capabilities.publish,
      subscribe: subscriber.capabilities.subscribe,
      patternSubscribe: subscriber.capabilities.patternSubscribe,
      ack: subscriber.capabilities.ack,
    },
    async connect() {
      await Promise.all([publisher.connect?.(), subscriber.connect?.()]);
    },
    async disconnect() {
      await Promise.all([publisher.disconnect?.(), subscriber.disconnect?.()]);
    },
    async publish(topic, payload, meta) {
      if (!publisher.capabilities.publish) {
        throw new NotSupportedError(`${publisher.name} does not support publish`);
      }
      await publisher.publish(topic, payload, meta);
    },
    async subscribe(topic, handler, meta) {
      if (!subscriber.capabilities.subscribe) {
        throw new NotSupportedError(`${subscriber.name} does not support subscribe`);
      }
      return subscriber.subscribe(topic, handler, meta);
    },
    async unsubscribe(handle, meta) {
      await subscriber.unsubscribe?.(handle, meta);
    },
  };
}
