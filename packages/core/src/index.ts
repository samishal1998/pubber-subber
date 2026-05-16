export { PubSub } from './pubsub';
export type { PubSubOptions, PubSubOp } from './pubsub';

export { compose } from './compose';
export type { ComposeOptions } from './compose';

export type {
  AnyAdapter,
  PublishMetaOf,
  PubSubAdapter,
  SubscribeMetaOf,
  UnsubscribeMetaOf,
} from './adapter';

export type {
  AdapterCapabilities,
  AdapterMessage,
  MessageHandler,
  SubscriptionHandle,
} from './types';

export { jsonCodec, passthroughCodec } from './codec';
export type { Codec } from './codec';

export {
  ConnectionError,
  NotSupportedError,
  PublishError,
  PubSubError,
  SerializationError,
  SubscriptionError,
} from './errors';

export { isPattern, matchTopic } from './topic-matcher';
