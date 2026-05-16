import {
  type AdapterMessage,
  type MessageHandler,
  type PubSubAdapter,
  isPattern,
  matchTopic,
} from '@pubber-subber/core';

export interface MemoryAdapterOptions {
  /**
   * Skip cloning published payloads. By default the adapter passes a
   * `structuredClone`d copy to subscribers so handlers can't mutate the
   * publisher's object. Set this if your payloads are immutable or contain
   * non-cloneable values (functions, class instances) and you accept the risk.
   */
  rawPayloads?: boolean;
}

export type MemoryMeta = Record<string, unknown>;

export function memory(
  opts: MemoryAdapterOptions = {},
): PubSubAdapter<MemoryMeta, MemoryMeta, MemoryMeta> {
  const exactSubs = new Map<string, Set<MessageHandler>>();
  const patternSubs = new Map<string, Set<MessageHandler>>();
  let idCounter = 0;

  const cloneIfNeeded = (value: unknown): unknown => {
    if (opts.rawPayloads) return value;
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  };

  return {
    name: 'memory',
    capabilities: {
      publish: true,
      subscribe: true,
      patternSubscribe: true,
      ack: false,
    },

    async publish(topic, payload, meta) {
      const buildMessage = (): AdapterMessage => ({
        topic,
        payload: cloneIfNeeded(payload),
        raw: payload,
        meta,
      });

      const exact = exactSubs.get(topic);
      if (exact && exact.size > 0) {
        for (const handler of [...exact]) {
          await safeDeliver(handler, buildMessage());
        }
      }

      for (const [pattern, handlers] of patternSubs) {
        if (matchTopic(pattern, topic)) {
          for (const handler of [...handlers]) {
            await safeDeliver(handler, buildMessage());
          }
        }
      }
    },

    async subscribe(topic, handler) {
      const map = isPattern(topic) ? patternSubs : exactSubs;
      let set = map.get(topic);
      if (!set) {
        set = new Set();
        map.set(topic, set);
      }
      set.add(handler);
      idCounter += 1;
      const id = `mem-${idCounter}`;
      const ownSet = set;
      return {
        id,
        topic,
        unsubscribe: async () => {
          ownSet.delete(handler);
          if (ownSet.size === 0) map.delete(topic);
        },
      };
    },
  };
}

async function safeDeliver(handler: MessageHandler, message: AdapterMessage): Promise<void> {
  try {
    await handler(message);
  } catch {
    // Handler errors are surfaced by the PubSub facade via onError; we
    // swallow here so one bad subscriber doesn't break delivery to the rest.
  }
}
