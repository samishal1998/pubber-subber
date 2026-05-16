import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';
import { firstValueFrom, take, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { fromTopic, toObservable } from '../src/index.js';

describe('rxjs bridge', () => {
  it('toObservable emits AdapterMessage envelopes', async () => {
    const pubsub = new PubSub({ adapter: memory() });
    const stream$ = toObservable<{ id: number }>(pubsub, 'users.created');

    // Race-free: subscribe synchronously, give pubsub a microtask to wire up,
    // then publish.
    const pending = firstValueFrom(stream$);
    await new Promise((r) => setTimeout(r, 0));
    await pubsub.publish('users.created', { id: 1 });

    const msg = await pending;
    expect(msg.topic).toBe('users.created');
    expect(msg.payload).toEqual({ id: 1 });
    await pubsub.disconnect();
  });

  it('fromTopic emits unwrapped payloads', async () => {
    const pubsub = new PubSub({ adapter: memory() });
    const stream$ = fromTopic<number>(pubsub, 'n').pipe(take(3), toArray());

    const pending = firstValueFrom(stream$);
    await new Promise((r) => setTimeout(r, 0));
    await pubsub.publish('n', 1);
    await pubsub.publish('n', 2);
    await pubsub.publish('n', 3);

    expect(await pending).toEqual([1, 2, 3]);
    await pubsub.disconnect();
  });

  it('teardown cancels the underlying subscription', async () => {
    const pubsub = new PubSub({ adapter: memory() });
    const seen: number[] = [];
    const sub = fromTopic<number>(pubsub, 't').subscribe((n) => seen.push(n));

    await new Promise((r) => setTimeout(r, 0));
    await pubsub.publish('t', 1);
    sub.unsubscribe();
    await pubsub.publish('t', 2);
    await new Promise((r) => setTimeout(r, 10));

    expect(seen).toEqual([1]);
    await pubsub.disconnect();
  });

  it('handles teardown before subscribe() resolves (cancellation race)', async () => {
    // Build a slow subscribe to expose the race window.
    const slowAdapter = {
      ...memory(),
      async subscribe(topic: string, handler: any) {
        await new Promise((r) => setTimeout(r, 25));
        // Memory's subscribe is synchronous, so call the real impl after delay.
        return memory().subscribe(topic, handler);
      },
    };
    const pubsub = new PubSub({ adapter: slowAdapter as any });

    const sub = fromTopic<number>(pubsub, 't').subscribe(() => {});
    sub.unsubscribe();

    // Should not throw, no errors propagate after teardown.
    await new Promise((r) => setTimeout(r, 50));
    await pubsub.disconnect();
    expect(true).toBe(true);
  });
});
