import {
  type AdapterMessage,
  type Codec,
  type MessageHandler,
  type PubSubAdapter,
  isPattern,
  jsonCodec,
} from '@pubber-subber/core';
import { Redis, type RedisOptions } from 'ioredis';

export interface RedisAdapterOptions {
  /** Redis connection URL, e.g. `redis://localhost:6379`. */
  url?: string;
  /** ioredis-compatible options. Combined with `url` if both are passed. */
  options?: RedisOptions;
  /**
   * Bring-your-own clients. When provided, the adapter will NOT manage their
   * lifecycle (connect/disconnect become no-ops on `disconnect`).
   * `publisher` and `subscriber` must be distinct clients because Redis
   * disallows non-pub/sub commands on a subscribed connection.
   */
  clients?: { publisher: Redis; subscriber: Redis };
  /** Payload codec. Default: JSON. */
  codec?: Codec;
}

export interface RedisPublishMeta {
  /** Override the wire channel for this publish; the AdapterMessage still carries `topic`. */
  channel?: string;
}

export interface RedisSubscribeMeta {
  /** Force PSUBSCRIBE even when `topic` has no wildcards. */
  pattern?: boolean;
}

export function redis(
  opts: RedisAdapterOptions = {},
): PubSubAdapter<RedisPublishMeta, RedisSubscribeMeta> {
  const codec = opts.codec ?? jsonCodec();

  let publisher: Redis | null = null;
  let subscriber: Redis | null = null;
  let owned = true;

  const exactHandlers = new Map<string, Set<MessageHandler>>();
  const patternHandlers = new Map<string, Set<MessageHandler>>();
  let idCounter = 0;
  let installedListeners = false;

  const createClient = (): Redis => {
    if (opts.url && opts.options) return new Redis(opts.url, opts.options);
    if (opts.url) return new Redis(opts.url);
    if (opts.options) return new Redis(opts.options);
    return new Redis();
  };

  const ensure = (): { publisher: Redis; subscriber: Redis } => {
    if (publisher && subscriber) return { publisher, subscriber };

    if (opts.clients) {
      publisher = opts.clients.publisher;
      subscriber = opts.clients.subscriber;
      owned = false;
    } else {
      publisher = createClient();
      subscriber = createClient();
      owned = true;
    }

    if (!installedListeners) {
      installedListeners = true;
      subscriber.on('message', (channel: string, message: string) => {
        deliver(exactHandlers.get(channel), channel, message, undefined);
      });
      subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
        deliver(patternHandlers.get(pattern), channel, message, { pattern });
      });
      // Re-subscribe after a reconnect.
      subscriber.on('ready', () => {
        for (const channel of exactHandlers.keys()) {
          subscriber?.subscribe(channel).catch(noop);
        }
        for (const pattern of patternHandlers.keys()) {
          subscriber?.psubscribe(pattern).catch(noop);
        }
      });
    }

    return { publisher, subscriber };
  };

  const deliver = (
    handlers: Set<MessageHandler> | undefined,
    channel: string,
    wireMessage: string,
    extraMeta: Record<string, unknown> | undefined,
  ) => {
    if (!handlers || handlers.size === 0) return;
    let payload: unknown;
    try {
      payload = codec.decode(wireMessage);
    } catch {
      payload = wireMessage;
    }
    const msg: AdapterMessage = {
      topic: channel,
      payload,
      raw: wireMessage,
      meta: extraMeta,
    };
    for (const handler of [...handlers]) {
      Promise.resolve(handler(msg)).catch(noop);
    }
  };

  return {
    name: 'redis',
    capabilities: { publish: true, subscribe: true, patternSubscribe: true, ack: false },

    async connect() {
      const { publisher: p, subscriber: s } = ensure();
      await Promise.all([waitReady(p), waitReady(s)]);
    },

    async disconnect() {
      if (!owned) {
        publisher = null;
        subscriber = null;
        return;
      }
      const closing: Promise<unknown>[] = [];
      if (subscriber) closing.push(subscriber.quit().catch(noop));
      if (publisher) closing.push(publisher.quit().catch(noop));
      await Promise.all(closing);
      publisher = null;
      subscriber = null;
      installedListeners = false;
      exactHandlers.clear();
      patternHandlers.clear();
    },

    async publish(topic, payload, meta) {
      const { publisher: p } = ensure();
      const channel = meta?.channel ?? topic;
      const encoded = codec.encode(payload);
      const wire = typeof encoded === 'string' ? encoded : Buffer.from(encoded);
      await p.publish(channel, wire as never);
    },

    async subscribe(topic, handler, meta) {
      const { subscriber: s } = ensure();
      const usePattern = meta?.pattern ?? isPattern(topic);
      const map = usePattern ? patternHandlers : exactHandlers;
      let set = map.get(topic);
      const firstSubscriber = !set;
      if (!set) {
        set = new Set();
        map.set(topic, set);
      }
      if (firstSubscriber) {
        if (usePattern) await s.psubscribe(topic);
        else await s.subscribe(topic);
      }
      set.add(handler);
      idCounter += 1;
      const id = `redis-${idCounter}`;
      const ownSet = set;
      return {
        id,
        topic,
        unsubscribe: async () => {
          ownSet.delete(handler);
          if (ownSet.size === 0) {
            map.delete(topic);
            if (subscriber) {
              if (usePattern) await subscriber.punsubscribe(topic).catch(noop);
              else await subscriber.unsubscribe(topic).catch(noop);
            }
          }
        },
      };
    },
  };
}

function noop(): void {
  // intentional
}

async function waitReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return;
  if (client.status === 'wait' || client.status === 'connecting') {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off('ready', onReady);
        client.off('error', onError);
      };
      client.once('ready', onReady);
      client.once('error', onError);
    });
    return;
  }
  await client.connect().catch((err) => {
    // Already connected/connecting is fine.
    if (!String(err?.message ?? '').includes('connect')) throw err;
  });
}
