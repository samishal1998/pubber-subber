import type { AnyAdapter, PublishMetaOf, SubscribeMetaOf } from './adapter';
import { NotSupportedError } from './errors';
import type { AdapterMessage, MessageHandler, SubscriptionHandle } from './types';

export type PubSubOp = 'publish' | 'subscribe' | 'handler' | 'unsubscribe';

export interface PubSubOptions<TAdapter extends AnyAdapter> {
  adapter: TAdapter;
  defaultMeta?: {
    publish?: PublishMetaOf<TAdapter>;
    subscribe?: SubscribeMetaOf<TAdapter>;
  };
  onError?: (err: unknown, ctx: { op: PubSubOp; topic: string }) => void;
}

export class PubSub<TAdapter extends AnyAdapter = AnyAdapter> {
  readonly adapter: TAdapter;
  readonly #defaultMeta: PubSubOptions<TAdapter>['defaultMeta'];
  readonly #onError: PubSubOptions<TAdapter>['onError'];
  readonly #handles = new Set<SubscriptionHandle>();
  #connected = false;
  #closed = false;

  constructor(opts: PubSubOptions<TAdapter>) {
    this.adapter = opts.adapter;
    this.#defaultMeta = opts.defaultMeta;
    this.#onError = opts.onError;
  }

  get isConnected(): boolean {
    return this.#connected && !this.#closed;
  }

  async connect(): Promise<void> {
    if (this.#closed) throw new Error('PubSub has been disconnected');
    if (this.#connected) return;
    await this.adapter.connect?.();
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const handles = [...this.#handles];
    this.#handles.clear();
    await Promise.allSettled(handles.map((h) => h.unsubscribe()));
    await this.adapter.disconnect?.();
    this.#connected = false;
  }

  async publish<T = unknown>(
    topic: string,
    payload: T,
    meta?: PublishMetaOf<TAdapter>,
  ): Promise<void> {
    if (!this.adapter.capabilities.publish) {
      throw new NotSupportedError(`${this.adapter.name} does not support publish`);
    }
    await this.#ensureConnected();
    const merged = mergeMeta(this.#defaultMeta?.publish, meta);
    try {
      await this.adapter.publish(topic, payload, merged);
    } catch (err) {
      this.#onError?.(err, { op: 'publish', topic });
      throw err;
    }
  }

  async subscribe<T = unknown>(
    topic: string,
    handler: MessageHandler<T, SubscribeMetaOf<TAdapter>>,
    meta?: SubscribeMetaOf<TAdapter>,
  ): Promise<SubscriptionHandle> {
    if (!this.adapter.capabilities.subscribe) {
      throw new NotSupportedError(`${this.adapter.name} does not support subscribe`);
    }
    await this.#ensureConnected();
    const merged = mergeMeta(this.#defaultMeta?.subscribe, meta);

    const wrappedHandler: MessageHandler = async (message) => {
      try {
        await handler(message as AdapterMessage<T>, merged as SubscribeMetaOf<TAdapter>);
      } catch (err) {
        this.#onError?.(err, { op: 'handler', topic });
        // Ack/nack is the adapter's responsibility — it sees the handler's outcome
        // (success vs throw) and decides what to do on the wire. Rethrow so the
        // adapter's own try/catch fires.
        throw err;
      }
    };

    let inner: SubscriptionHandle;
    try {
      inner = await this.adapter.subscribe(topic, wrappedHandler, merged);
    } catch (err) {
      this.#onError?.(err, { op: 'subscribe', topic });
      throw err;
    }

    const tracked: SubscriptionHandle = {
      id: inner.id,
      topic: inner.topic,
      unsubscribe: async () => {
        this.#handles.delete(tracked);
        try {
          await inner.unsubscribe();
        } catch (err) {
          this.#onError?.(err, { op: 'unsubscribe', topic: inner.topic });
          throw err;
        }
      },
    };
    this.#handles.add(tracked);
    return tracked;
  }

  async #ensureConnected(): Promise<void> {
    if (this.#closed) throw new Error('PubSub has been disconnected');
    if (!this.#connected) await this.connect();
  }
}

function mergeMeta<T>(base: T | undefined, override: T | undefined): T | undefined {
  if (base === undefined) return override;
  if (override === undefined) return base;
  if (
    typeof base === 'object' &&
    base !== null &&
    typeof override === 'object' &&
    override !== null &&
    !Array.isArray(base) &&
    !Array.isArray(override)
  ) {
    return { ...(base as object), ...(override as object) } as T;
  }
  return override;
}
