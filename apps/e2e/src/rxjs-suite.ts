import { type AnyAdapter, PubSub } from '@pubber-subber/core';
import { fromTopic, toObservable } from '@pubber-subber/rxjs';
import { firstValueFrom, lastValueFrom, take, toArray } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

export interface RxjsSuiteOptions {
  /** Display name for the suite. */
  name: string;
  /** Build a fresh adapter for the suite. The container creating it should
   * already be running before this is called. */
  createAdapter: () => Promise<AnyAdapter> | AnyAdapter;
  /** Cleanup hook (the adapter, not the underlying service). */
  teardownAdapter?: (adapter: AnyAdapter) => Promise<void> | void;
  /** ms to wait after `.subscribe()` before publishing, so the underlying
   * SUBSCRIBE / LISTEN has time to register on the server. */
  subscribeSettleMs?: number;
  /** ms to wait between publishes when ordering matters. */
  publishGapMs?: number;
  /** ms to wait for the final value(s) before failing. */
  deliveryTimeoutMs?: number;
}

export function runRxjsSuite(opts: RxjsSuiteOptions): void {
  const settle = opts.subscribeSettleMs ?? 50;
  const gap = opts.publishGapMs ?? 5;
  const timeoutMs = opts.deliveryTimeoutMs ?? 5000;

  describe(`rxjs bridge: ${opts.name}`, () => {
    let adapter: AnyAdapter;
    let pubsub: PubSub;

    beforeAll(async () => {
      adapter = await opts.createAdapter();
      pubsub = new PubSub({ adapter });
      await pubsub.connect();
    });

    afterAll(async () => {
      await pubsub.disconnect();
      await opts.teardownAdapter?.(adapter);
    });

    it('fromTopic emits unwrapped payloads', async () => {
      const topic = unique('rxjs-from');
      const first = firstValueFrom(fromTopic<{ id: number }>(pubsub, topic));
      await sleep(settle);
      await pubsub.publish(topic, { id: 7 });
      expect(await withTimeout(first, timeoutMs)).toEqual({ id: 7 });
    });

    it('toObservable emits the full AdapterMessage envelope', async () => {
      const topic = unique('rxjs-env');
      const first = firstValueFrom(toObservable<string>(pubsub, topic));
      await sleep(settle);
      await pubsub.publish(topic, 'hello');
      const msg = await withTimeout(first, timeoutMs);
      expect(msg.topic).toBe(topic);
      expect(msg.payload).toBe('hello');
    });

    it('take(N) collects exactly N then completes', async () => {
      const topic = unique('rxjs-take');
      const collected = lastValueFrom(fromTopic<number>(pubsub, topic).pipe(take(3), toArray()));
      await sleep(settle);
      for (let i = 0; i < 5; i += 1) {
        await pubsub.publish(topic, i);
        await sleep(gap);
      }
      expect(await withTimeout(collected, timeoutMs)).toEqual([0, 1, 2]);
    });

    it('unsubscribe stops delivery to the RxJS subscriber', async () => {
      const topic = unique('rxjs-stop');
      const seen: number[] = [];
      const sub = fromTopic<number>(pubsub, topic).subscribe((n) => seen.push(n));
      await sleep(settle);

      await pubsub.publish(topic, 1);
      await sleep(settle);
      sub.unsubscribe();

      await pubsub.publish(topic, 2);
      await sleep(settle);
      expect(seen).toEqual([1]);
    });

    it('multiple Observable subscribers each receive every message', async () => {
      const topic = unique('rxjs-multi');
      const a: number[] = [];
      const b: number[] = [];
      const subA = fromTopic<number>(pubsub, topic).subscribe((n) => a.push(n));
      const subB = fromTopic<number>(pubsub, topic).subscribe((n) => b.push(n));
      await sleep(settle);

      await pubsub.publish(topic, 1);
      await pubsub.publish(topic, 2);
      await sleep(settle);

      subA.unsubscribe();
      subB.unsubscribe();
      expect(a).toEqual([1, 2]);
      expect(b).toEqual([1, 2]);
    });

    it('handles unsubscribe before the underlying subscribe resolves (cancellation race)', async () => {
      const topic = unique('rxjs-race');
      // Subscribe, then immediately unsubscribe — should not throw or leak.
      const sub = fromTopic<number>(pubsub, topic).subscribe(() => {
        throw new Error('should not receive');
      });
      sub.unsubscribe();
      // Give any async wiring time to settle.
      await sleep(settle + 50);
      // A publish after teardown should be a no-op for our handler.
      await pubsub.publish(topic, 1);
      await sleep(settle);
    });
  });
}

function unique(base: string): string {
  return `${base}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
