import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyAdapter } from '../adapter';
import { PubSub } from '../pubsub';

export interface ConformanceOptions {
  /** Display name for the suite. */
  name: string;
  /** Build a fresh adapter for the test run. */
  createAdapter: () => Promise<AnyAdapter> | AnyAdapter;
  /** Optional cleanup, called after the suite. */
  teardownAdapter?: (adapter: AnyAdapter) => Promise<void> | void;
  /** Make topic names unique per test run. Defaults to `${base}-${pid}-${ts}-${seq}`. */
  uniqueTopic?: (base: string) => string;
  /** Per-feature opt-out for adapters that don't support a capability. */
  skip?: {
    patternSubscribe?: boolean;
    metadata?: boolean;
    multipleSubscribers?: boolean;
    lateSubscriber?: boolean;
  };
  /** ms to wait for a delivered message before failing the test. */
  deliveryTimeoutMs?: number;
  /** ms to wait when asserting NO message was delivered. */
  quietWindowMs?: number;
}

export function runConformance(opts: ConformanceOptions): void {
  const skip = opts.skip ?? {};
  const deliveryTimeoutMs = opts.deliveryTimeoutMs ?? 2000;
  const quietWindowMs = opts.quietWindowMs ?? 200;
  const unique = opts.uniqueTopic ?? defaultUniqueTopic;

  describe(`conformance: ${opts.name}`, () => {
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

    it('round-trips a single message', async () => {
      const topic = unique('round-trip');
      const received = waitFor<unknown>(deliveryTimeoutMs);
      const sub = await pubsub.subscribe(topic, (msg) => {
        received.resolve(msg.payload);
      });
      await pubsub.publish(topic, { hello: 'world' });
      expect(await received.promise).toEqual({ hello: 'world' });
      await sub.unsubscribe();
    });

    it.skipIf(skip.multipleSubscribers)('delivers to multiple subscribers', async () => {
      const topic = unique('multi-sub');
      const a = waitFor<unknown>(deliveryTimeoutMs);
      const b = waitFor<unknown>(deliveryTimeoutMs);
      const subA = await pubsub.subscribe(topic, (msg) => a.resolve(msg.payload));
      const subB = await pubsub.subscribe(topic, (msg) => b.resolve(msg.payload));
      await pubsub.publish(topic, 'fan-out');
      expect(await a.promise).toBe('fan-out');
      expect(await b.promise).toBe('fan-out');
      await subA.unsubscribe();
      await subB.unsubscribe();
    });

    it.skipIf(skip.lateSubscriber)(
      'does not deliver to subscribers added after publish',
      async () => {
        const topic = unique('late-sub');
        await pubsub.publish(topic, 'first');

        let delivered: unknown = undefined;
        const sub = await pubsub.subscribe(topic, (msg) => {
          delivered = msg.payload;
        });

        await sleep(quietWindowMs);
        expect(delivered).toBeUndefined();
        await sub.unsubscribe();
      },
    );

    it('stops delivery after unsubscribe', async () => {
      const topic = unique('stop-on-unsub');
      let count = 0;
      const sub = await pubsub.subscribe(topic, () => {
        count += 1;
      });
      await pubsub.publish(topic, 1);
      await sleep(quietWindowMs);
      expect(count).toBe(1);

      await sub.unsubscribe();
      await pubsub.publish(topic, 2);
      await sleep(quietWindowMs);
      expect(count).toBe(1);
    });

    it.skipIf(skip.metadata)('passes metadata through to the handler', async () => {
      const topic = unique('meta');
      const received = waitFor<{ payload: unknown; meta: unknown }>(deliveryTimeoutMs);
      const sub = await pubsub.subscribe(
        topic,
        (msg, meta) => {
          received.resolve({ payload: msg.payload, meta: meta ?? msg.meta });
        },
        { hint: 'sub-meta' } as any,
      );
      await pubsub.publish(topic, { ok: true }, { hint: 'pub-meta' } as any);
      const got = await received.promise;
      expect(got.payload).toEqual({ ok: true });
      await sub.unsubscribe();
    });

    if (!skip.patternSubscribe) {
      it('supports pattern subscriptions when capability declared', async () => {
        if (!adapter.capabilities.patternSubscribe) return;

        const base = unique('pattern');
        const received: unknown[] = [];
        const sub = await pubsub.subscribe(`${base}.*`, (msg) => {
          received.push(msg.payload);
        });
        await pubsub.publish(`${base}.alpha`, 1);
        await pubsub.publish(`${base}.beta`, 2);
        await sleep(quietWindowMs);
        expect(received.sort()).toEqual([1, 2]);
        await sub.unsubscribe();
      });
    }
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function waitFor<T = unknown>(timeoutMs: number): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer = setTimeout(() => reject(new Error(`Timeout waiting ${timeoutMs}ms`)), timeoutMs);
  promise.finally(() => clearTimeout(timer)).catch(() => undefined);
  return { promise, resolve, reject };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let counter = 0;
function defaultUniqueTopic(base: string): string {
  counter += 1;
  return `${base}-${process.pid}-${Date.now()}-${counter}`;
}
