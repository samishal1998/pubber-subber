import { describe, expect, it, vi } from 'vitest';
import type { PubSubAdapter } from '../src/index.js';
import { NotSupportedError, PubSub, compose } from '../src/index.js';

const publisher: PubSubAdapter = {
  name: 'fake-pub',
  capabilities: { publish: true, subscribe: false, patternSubscribe: false, ack: false },
  publish: vi.fn(async () => {}),
  subscribe: async () => {
    throw new NotSupportedError('subscribe not supported');
  },
};

const subscriber: PubSubAdapter = {
  name: 'fake-sub',
  capabilities: { publish: false, subscribe: true, patternSubscribe: true, ack: true },
  publish: async () => {
    throw new NotSupportedError('publish not supported');
  },
  subscribe: vi.fn(async (topic) => ({
    id: 'sub',
    topic,
    unsubscribe: async () => {},
  })),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
};

describe('compose', () => {
  it('unions capabilities from publisher + subscriber', () => {
    const composed = compose({ publisher, subscriber });
    expect(composed.capabilities).toEqual({
      publish: true,
      subscribe: true,
      patternSubscribe: true,
      ack: true,
    });
  });

  it('routes publish to the publisher and subscribe to the subscriber', async () => {
    const composed = compose({ publisher, subscriber });
    const pubsub = new PubSub({ adapter: composed });

    await pubsub.publish('t', { ok: true });
    await pubsub.subscribe('t', () => {});

    expect(publisher.publish).toHaveBeenCalled();
    expect(subscriber.subscribe).toHaveBeenCalled();
  });

  it('connects and disconnects both adapters', async () => {
    const composed = compose({ publisher, subscriber });
    const pubsub = new PubSub({ adapter: composed });
    await pubsub.connect();
    expect(subscriber.connect).toHaveBeenCalled();
    await pubsub.disconnect();
    expect(subscriber.disconnect).toHaveBeenCalled();
  });
});
