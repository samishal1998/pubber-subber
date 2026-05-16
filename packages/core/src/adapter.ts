import type { AdapterCapabilities, MessageHandler, SubscriptionHandle } from './types';

export interface PubSubAdapter<TPubMeta = unknown, TSubMeta = unknown, TUnsubMeta = unknown> {
  readonly name: string;
  readonly capabilities: AdapterCapabilities;

  connect?(): Promise<void>;
  disconnect?(): Promise<void>;

  publish(topic: string, payload: unknown, meta?: TPubMeta): Promise<void>;

  subscribe(topic: string, handler: MessageHandler, meta?: TSubMeta): Promise<SubscriptionHandle>;

  unsubscribe?(handle: SubscriptionHandle, meta?: TUnsubMeta): Promise<void>;
}

export type AnyAdapter = PubSubAdapter<any, any, any>;

export type PublishMetaOf<A> = A extends PubSubAdapter<infer M, any, any> ? M : never;
export type SubscribeMetaOf<A> = A extends PubSubAdapter<any, infer M, any> ? M : never;
export type UnsubscribeMetaOf<A> = A extends PubSubAdapter<any, any, infer M> ? M : never;
