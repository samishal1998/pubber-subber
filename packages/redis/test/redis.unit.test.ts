import { EventEmitter } from 'node:events';
import { PubSub } from '@pubber-subber/core';
import { describe, expect, it, vi } from 'vitest';
import { redis } from '../src/index.js';

/**
 * A tiny in-process stand-in for an ioredis client. Implements just enough of
 * the surface that the redis adapter uses, so we can verify wiring without
 * needing a real Redis.
 */
class FakeRedis extends EventEmitter {
  status: 'ready' | 'connecting' = 'ready';
  publish = vi.fn(async (channel: string, message: string) => {
    bus.emit('message', channel, message);
    return 1;
  });
  subscribe = vi.fn(async () => {});
  unsubscribe = vi.fn(async () => {});
  psubscribe = vi.fn(async () => {});
  punsubscribe = vi.fn(async () => {});
  quit = vi.fn(async () => 'OK' as const);
  connect = vi.fn(async () => {});
  off = this.removeListener;
}

/** Shared bus so the fake publisher can reach the fake subscriber. */
const bus = new EventEmitter();

describe('redis adapter (unit)', () => {
  it('uses SUBSCRIBE for exact topics and PSUBSCRIBE for wildcard topics', async () => {
    const publisher = new FakeRedis();
    const subscriber = new FakeRedis();
    const adapter = redis({
      clients: { publisher: publisher as never, subscriber: subscriber as never },
    });
    const pubsub = new PubSub({ adapter });

    await pubsub.subscribe('exact-channel', () => {});
    await pubsub.subscribe('users.*', () => {});

    expect(subscriber.subscribe).toHaveBeenCalledWith('exact-channel');
    expect(subscriber.psubscribe).toHaveBeenCalledWith('users.*');
  });

  it('overrides the channel via publish meta', async () => {
    const publisher = new FakeRedis();
    const subscriber = new FakeRedis();
    const adapter = redis({
      clients: { publisher: publisher as never, subscriber: subscriber as never },
    });
    const pubsub = new PubSub({ adapter });

    await pubsub.publish('logical.topic', { a: 1 }, { channel: 'wire.channel' });
    expect(publisher.publish).toHaveBeenCalledWith('wire.channel', JSON.stringify({ a: 1 }));
  });

  it('round-trips a message through the fake bus', async () => {
    bus.removeAllListeners();
    const publisher = new FakeRedis();
    const subscriber = new FakeRedis();
    // Wire fake bus → subscriber 'message' event
    bus.on('message', (channel, message) => subscriber.emit('message', channel, message));

    const adapter = redis({
      clients: { publisher: publisher as never, subscriber: subscriber as never },
    });
    const pubsub = new PubSub({ adapter });

    const received = new Promise<unknown>((resolve) => {
      pubsub.subscribe('hello', (msg) => resolve(msg.payload));
    });
    // Give subscribe a tick to register.
    await new Promise((r) => setTimeout(r, 0));
    await pubsub.publish('hello', { greeting: 'world' });
    expect(await received).toEqual({ greeting: 'world' });
  });

  it('only calls subscribe once per channel regardless of handler count', async () => {
    const publisher = new FakeRedis();
    const subscriber = new FakeRedis();
    const adapter = redis({
      clients: { publisher: publisher as never, subscriber: subscriber as never },
    });
    const pubsub = new PubSub({ adapter });

    await pubsub.subscribe('x', () => {});
    await pubsub.subscribe('x', () => {});
    await pubsub.subscribe('x', () => {});

    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from the wire when the last handler goes away', async () => {
    const publisher = new FakeRedis();
    const subscriber = new FakeRedis();
    const adapter = redis({
      clients: { publisher: publisher as never, subscriber: subscriber as never },
    });
    const pubsub = new PubSub({ adapter });

    const a = await pubsub.subscribe('x', () => {});
    const b = await pubsub.subscribe('x', () => {});

    await a.unsubscribe();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    await b.unsubscribe();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('x');
  });
});
