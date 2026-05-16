import { PubSub } from '@pubber-subber/core';
import { describe, expect, it } from 'vitest';
import { memory } from '../src/index.js';

describe('memory adapter specifics', () => {
  it('clones payloads by default', async () => {
    const pubsub = new PubSub({ adapter: memory() });
    const original = { counter: 0 };

    const received = new Promise<{ counter: number }>((resolve) => {
      pubsub.subscribe<{ counter: number }>('t', (msg) => {
        resolve(msg.payload);
      });
    });

    await pubsub.publish('t', original);
    const got = await received;
    got.counter = 99;
    expect(original.counter).toBe(0);
  });

  it('does not clone when rawPayloads=true', async () => {
    const pubsub = new PubSub({ adapter: memory({ rawPayloads: true }) });
    const original = { counter: 0 };

    const received = new Promise<{ counter: number }>((resolve) => {
      pubsub.subscribe<{ counter: number }>('t', (msg) => {
        resolve(msg.payload);
      });
    });

    await pubsub.publish('t', original);
    const got = await received;
    expect(got).toBe(original);
  });

  it('does not break delivery if a handler throws', async () => {
    const pubsub = new PubSub({ adapter: memory() });
    let goodCalls = 0;
    await pubsub.subscribe('t', () => {
      throw new Error('bad subscriber');
    });
    await pubsub.subscribe('t', () => {
      goodCalls += 1;
    });
    await pubsub.publish('t', 1);
    await pubsub.publish('t', 2);
    expect(goodCalls).toBe(2);
  });

  it('matches glob patterns', async () => {
    const pubsub = new PubSub({ adapter: memory() });
    const received: string[] = [];
    await pubsub.subscribe('users.*', (msg) => {
      received.push(msg.topic);
    });

    await pubsub.publish('users.created', 1);
    await pubsub.publish('users.updated', 2);
    await pubsub.publish('orders.created', 3);

    expect(received.sort()).toEqual(['users.created', 'users.updated']);
  });
});
