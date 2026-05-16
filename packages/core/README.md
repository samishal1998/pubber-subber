# @pubber-subber/core

The transport-agnostic core of [pubber-subber](https://www.npmjs.com/package/pubber-subber). Defines the adapter contract that every transport implements, the `PubSub` facade that your app uses, codec helpers, a typed error hierarchy, the `compose()` helper for hybrid publish/subscribe (e.g. SNS + SQS), and a vitest-based conformance kit for verifying custom adapters.

- **Zero runtime dependencies.**
- Dual ESM + CJS, full `.d.ts`.
- Strict TypeScript, Node 20.11+.

## Install

```sh
pnpm add @pubber-subber/core
```

You'll also need at least one adapter:

```sh
pnpm add @pubber-subber/memory       # in-process
pnpm add @pubber-subber/redis ioredis
pnpm add @pubber-subber/pg pg
pnpm add @pubber-subber/gcp-pubsub @google-cloud/pubsub
pnpm add @pubber-subber/aws-sns @aws-sdk/client-sns
pnpm add @pubber-subber/aws-sqs @aws-sdk/client-sqs
```

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';

const pubsub = new PubSub({ adapter: memory() });

const sub = await pubsub.subscribe('users.created', (msg) => {
  console.log(msg.topic, msg.payload);
});

await pubsub.publish('users.created', { id: 1, name: 'Alice' });

await sub.unsubscribe();
await pubsub.disconnect();
```

Swap the adapter for `redis()`, `pg()`, `gcpPubSub()`, or a composed AWS pair — nothing else changes.

## The `PubSub` facade

```ts
new PubSub<TAdapter>({
  adapter: TAdapter,
  defaultMeta?: {
    publish?: PublishMetaOf<TAdapter>;
    subscribe?: SubscribeMetaOf<TAdapter>;
  };
  onError?: (err, ctx: { op: 'publish' | 'subscribe' | 'handler' | 'unsubscribe'; topic: string }) => void;
})
```

- `await pubsub.connect()` — lazily called on first op, but you can call it manually if you want to fail fast on a bad config.
- `await pubsub.publish(topic, payload, meta?)` — forwards to the adapter; merges `defaultMeta.publish` with the call-site `meta` (call-site wins on key collision).
- `await pubsub.subscribe(topic, handler, meta?)` — returns a `SubscriptionHandle` with `unsubscribe()`. The facade tracks every handle so `disconnect()` drains them.
- `await pubsub.disconnect()` — unsubscribes all live handles, then asks the adapter to disconnect.
- `pubsub.isConnected` — boolean, useful for health checks.

The three generic meta slots on `PubSubAdapter<TPubMeta, TSubMeta, TUnsubMeta>` flow through `PubSub` via the `PublishMetaOf<A>` / `SubscribeMetaOf<A>` helpers, so users get full IntelliSense for the chosen adapter's knobs (e.g. Redis's `pattern`, GCP's `orderingKey`, SQS's `handlerConcurrency`).

## `compose()` — hybrid publish + subscribe

Some platforms split publish from subscribe — the canonical case is AWS, where SNS publishes and SQS receives. `compose()` welds a publish-capable adapter and a subscribe-capable adapter into one:

```ts
import { PubSub, compose } from '@pubber-subber/core';
import { awsSns } from '@pubber-subber/aws-sns';
import { awsSqs } from '@pubber-subber/aws-sqs';

const pubsub = new PubSub({
  adapter: compose({
    publisher: awsSns({ region: 'us-east-1' }),
    subscriber: awsSqs({ region: 'us-east-1', queueUrl: '...' }),
  }),
});
```

Capabilities are unioned (publish from `publisher`, subscribe/ack from `subscriber`). `connect`/`disconnect` fan out to both. `publish` routes to the publisher; `subscribe` routes to the subscriber.

## Codecs

```ts
import { jsonCodec, passthroughCodec, type Codec } from '@pubber-subber/core';
```

- `jsonCodec()` — default for adapters that don't override. `JSON.stringify` / `JSON.parse`, throwing `SerializationError` on failure.
- `passthroughCodec()` — for byte-pipe adapters; accepts only `string` or `Uint8Array`.
- Implement `Codec` yourself for MessagePack, Protobuf, AVRO, etc.

```ts
interface Codec {
  readonly name: string;
  encode(value: unknown): string | Uint8Array;
  decode<T = unknown>(data: string | Uint8Array): T;
}
```

## Errors

All errors extend `PubSubError`, which extends `Error` (so the standard `cause` works):

| Class | Thrown when |
| --- | --- |
| `NotSupportedError` | The adapter doesn't support the requested operation. |
| `ConnectionError` | Connect / disconnect failure. |
| `SerializationError` | Codec `encode` / `decode` failure. |
| `SubscriptionError` | Subscribe-side wiring failure (e.g. missing required config). |
| `PublishError` | Publish-side wiring failure (e.g. pg NOTIFY size limit exceeded). |

```ts
import { NotSupportedError } from '@pubber-subber/core';

try {
  await pubsub.publish('t', payload);
} catch (err) {
  if (err instanceof NotSupportedError) { /* ... */ }
}
```

## Conformance kit (for adapter authors)

The same vitest suite that validates the official adapters is exported for your own:

```ts
// my-adapter/test/conformance.test.ts
import { runConformance } from '@pubber-subber/core/testing';
import { myAdapter } from '../src/index.js';

runConformance({
  name: 'my-adapter',
  createAdapter: () => myAdapter({ /* ... */ }),
  // For adapters without certain capabilities:
  skip: { patternSubscribe: true },
  // Bump these if your transport has noticeable propagation latency:
  deliveryTimeoutMs: 5000,
  quietWindowMs: 500,
});
```

It tests: single round-trip, multi-subscriber fan-out, no replay for late subscribers, unsubscribe stops delivery, metadata pass-through, and pattern subscriptions (when the adapter declares the capability).

`vitest` is an **optional peer dependency** — only required if you import from `@pubber-subber/core/testing`.

## Writing your own adapter

Implement the `PubSubAdapter` interface and return it from a factory:

```ts
import type {
  AdapterMessage,
  MessageHandler,
  PubSubAdapter,
  SubscriptionHandle,
} from '@pubber-subber/core';

interface MyPublishMeta { /* knobs to expose on publish */ }
interface MySubscribeMeta { /* knobs to expose on subscribe */ }

export function myAdapter(opts: MyOptions): PubSubAdapter<MyPublishMeta, MySubscribeMeta> {
  return {
    name: 'my-adapter',
    capabilities: {
      publish: true,
      subscribe: true,
      patternSubscribe: false,
      ack: false,
    },

    async connect() { /* ... */ },
    async disconnect() { /* ... */ },

    async publish(topic, payload, meta) { /* ... */ },

    async subscribe(topic, handler, meta): Promise<SubscriptionHandle> {
      // wire delivery, then return a handle
      return {
        id: 'sub-id',
        topic,
        unsubscribe: async () => { /* ... */ },
      };
    },
  };
}
```

Run the conformance kit against it (above) and you're done.

## API summary

```ts
export class PubSub<TAdapter>
export function compose<P, S>(opts: { publisher: P; subscriber: S; name?: string }): PubSubAdapter

export interface PubSubAdapter<TPubMeta, TSubMeta, TUnsubMeta>
export type PublishMetaOf<A>
export type SubscribeMetaOf<A>
export type UnsubscribeMetaOf<A>

export interface AdapterMessage<TPayload>
export type MessageHandler<TPayload, TMeta>
export interface SubscriptionHandle
export interface AdapterCapabilities

export interface Codec
export function jsonCodec(): Codec
export function passthroughCodec(): Codec

export class PubSubError extends Error
export class NotSupportedError extends PubSubError
export class ConnectionError extends PubSubError
export class SerializationError extends PubSubError
export class SubscriptionError extends PubSubError
export class PublishError extends PubSubError

export function matchTopic(pattern: string, topic: string): boolean
export function isPattern(input: string): boolean

// From '@pubber-subber/core/testing':
export function runConformance(opts: ConformanceOptions): void
```

## Ecosystem

| Package | Purpose | Driver peer dep |
| --- | --- | --- |
| `@pubber-subber/memory` | In-process | – |
| `@pubber-subber/redis` | Redis pub/sub | `ioredis` |
| `@pubber-subber/pg` | Postgres `LISTEN/NOTIFY` | `pg` |
| `@pubber-subber/gcp-pubsub` | Google Cloud Pub/Sub | `@google-cloud/pubsub` |
| `@pubber-subber/aws-sns` | AWS SNS (publish-only) | `@aws-sdk/client-sns` |
| `@pubber-subber/aws-sqs` | AWS SQS (subscribe-only) | `@aws-sdk/client-sqs` |
| `@pubber-subber/rxjs` | Optional RxJS bridge | `rxjs` |

## License

MIT
