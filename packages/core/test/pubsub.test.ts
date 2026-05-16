import { describe, expect, it, vi } from 'vitest';
import type { PubSubAdapter } from '../src/index.js';
import { NotSupportedError, PubSub } from '../src/index.js';

function fakeAdapter(overrides: Partial<PubSubAdapter> = {}): PubSubAdapter {
  return {
    name: 'fake',
    capabilities: { publish: true, subscribe: true, patternSubscribe: false, ack: false },
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(async (topic) => ({
      id: 'sub-1',
      topic,
      unsubscribe: vi.fn(async () => {}),
    })),
    ...overrides,
  };
}

describe('PubSub', () => {
  it('publishes via the adapter', async () => {
    const adapter = fakeAdapter();
    const pubsub = new PubSub({ adapter });
    await pubsub.publish('t', { x: 1 });
    expect(adapter.publish).toHaveBeenCalledWith('t', { x: 1 }, undefined);
  });

  it('merges default publish meta with call-site meta (call-site wins)', async () => {
    const adapter = fakeAdapter();
    const pubsub = new PubSub({
      adapter,
      defaultMeta: { publish: { a: 1, shared: 'default' } as any },
    });
    await pubsub.publish('t', null, { b: 2, shared: 'override' } as any);
    expect(adapter.publish).toHaveBeenCalledWith('t', null, {
      a: 1,
      b: 2,
      shared: 'override',
    });
  });

  it('throws NotSupportedError when adapter has publish=false', async () => {
    const adapter = fakeAdapter({
      capabilities: { publish: false, subscribe: true, patternSubscribe: false, ack: false },
    });
    const pubsub = new PubSub({ adapter });
    await expect(pubsub.publish('t', 'x')).rejects.toBeInstanceOf(NotSupportedError);
  });

  it('throws NotSupportedError when adapter has subscribe=false', async () => {
    const adapter = fakeAdapter({
      capabilities: { publish: true, subscribe: false, patternSubscribe: false, ack: false },
    });
    const pubsub = new PubSub({ adapter });
    await expect(pubsub.subscribe('t', () => {})).rejects.toBeInstanceOf(NotSupportedError);
  });

  it('disconnect unsubscribes outstanding handles', async () => {
    const unsubscribe = vi.fn(async () => {});
    const adapter = fakeAdapter({
      subscribe: vi.fn(async (topic) => ({ id: 'sub-1', topic, unsubscribe })),
    });
    const pubsub = new PubSub({ adapter });
    await pubsub.subscribe('t', () => {});
    await pubsub.disconnect();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(adapter.disconnect).toBeUndefined();
  });

  it('calls adapter.connect lazily on first op', async () => {
    const connect = vi.fn(async () => {});
    const adapter = fakeAdapter({ connect });
    const pubsub = new PubSub({ adapter });
    expect(connect).not.toHaveBeenCalled();
    await pubsub.publish('t', 1);
    expect(connect).toHaveBeenCalledTimes(1);
    await pubsub.publish('t', 2);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reports handler errors via onError and rethrows', async () => {
    const adapter = fakeAdapter({
      subscribe: vi.fn(async (topic, handler) => {
        // Simulate the adapter immediately delivering one message
        queueMicrotask(() => {
          handler({ topic, payload: 'boom' }).catch(() => undefined);
        });
        return { id: 'sub-1', topic, unsubscribe: async () => {} };
      }),
    });
    const onError = vi.fn();
    const pubsub = new PubSub({ adapter, onError });
    await pubsub.subscribe('t', () => {
      throw new Error('handler failed');
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[1]).toEqual({ op: 'handler', topic: 't' });
  });

  it('rejects further work after disconnect', async () => {
    const adapter = fakeAdapter();
    const pubsub = new PubSub({ adapter });
    await pubsub.disconnect();
    await expect(pubsub.publish('t', 1)).rejects.toThrow(/disconnected/);
  });
});
