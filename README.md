# pubber-subber

Transport-agnostic pub/sub for Node.js. One API, swappable backend.

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

Swap `memory()` for `redis(...)`, `pg(...)`, `gcpPubSub(...)`, or a composed `awsSns()`/`awsSqs()` pair — nothing else in your code changes.

## Why

The JS ecosystem already has Keyv for key-value and Drizzle for SQL. `pubber-subber` is the same idea for pub/sub: a small, typed, adapter-first core that stays out of your way, plus a maintained set of drivers for the messaging systems people actually use.

- **Adapter-driven.** Write to one interface, plug in any backend. Bring your own adapter for NATS, Kafka, MQTT, BroadcastChannel — whatever.
- **Typed metadata, all the way through.** Every method takes an adapter-aware `meta` arg so adapters can expose their own knobs (Redis pattern subscribe, GCP `orderingKey`, SQS `MessageGroupId`, ack semantics) without bloating the core.
- **RxJS opt-in.** Streams are powerful; not everyone wants them. The bridge lives in its own package.
- **Tiny core.** `@pubber-subber/core` has zero runtime dependencies.

## Built-in adapters

| Adapter                | Package                     | Driver peer dep         |
| ---------------------- | --------------------------- | ----------------------- |
| In-memory              | `@pubber-subber/memory`     | –                       |
| Redis-like             | `@pubber-subber/redis`      | `ioredis`               |
| Postgres LISTEN/NOTIFY | `@pubber-subber/pg`         | `pg`                    |
| Google Cloud Pub/Sub   | `@pubber-subber/gcp-pubsub` | `@google-cloud/pubsub`  |
| AWS SNS (publish)      | `@pubber-subber/aws-sns`    | `@aws-sdk/client-sns`   |
| AWS SQS (subscribe)    | `@pubber-subber/aws-sqs`    | `@aws-sdk/client-sqs`   |
| RxJS bridge            | `@pubber-subber/rxjs`       | `rxjs`                  |

## RxJS

```ts
import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';
import { fromTopic } from '@pubber-subber/rxjs';
import { bufferTime, mergeMap } from 'rxjs';

const pubsub = new PubSub({ adapter: memory() });

fromTopic<{ id: number }>(pubsub, 'users.created')
  .pipe(
    bufferTime(250),
    mergeMap((batch) => persistBatch(batch)),
  )
  .subscribe();
```

## Composing publishers and subscribers (e.g. SNS → SQS)

```ts
import { PubSub, compose } from '@pubber-subber/core';
import { awsSns } from '@pubber-subber/aws-sns';
import { awsSqs } from '@pubber-subber/aws-sqs';

const pubsub = new PubSub({
  adapter: compose({
    publisher: awsSns({ region: 'us-east-1' }),
    subscriber: awsSqs({ region: 'us-east-1', queueUrl: process.env.SQS_URL! }),
  }),
});
```

## Writing your own adapter

Implement `PubSubAdapter` from `@pubber-subber/core`. The conformance kit at `@pubber-subber/core/testing` will tell you what passes and what doesn't.

```ts
import { runConformance } from '@pubber-subber/core/testing';
import { myAdapter } from './my-adapter';

runConformance({
  name: 'my-adapter',
  createAdapter: async () => myAdapter({ /* ... */ }),
});
```

## Benchmarks

A small HTTP service wraps the library and exposes `POST /publish`; [k6](https://k6.io) drives sustained load against it. The service measures pub→subscribe latency by stamping each payload with `t = Date.now()` and computing the delta when its own subscriber receives the message — that's the metric that actually reflects each adapter's behavior, not the HTTP-side numbers.

**50 virtual users sustained for 15 seconds**, single MacBook (Apple Silicon), local Docker for redis/pg. Your numbers will vary.

| Adapter | HTTP req/s | HTTP p95 | Pub → sub avg | Pub → sub max | Delivered |
| --- | ---: | ---: | ---: | ---: | --- |
| `memory` | **40,165** | 2.11 ms | ~0 ms | 15 ms | 602,523 / 602,523 |
| `redis`  | **31,446** | 2.38 ms | 0.71 ms | 29 ms | 471,732 / 471,732 |
| `pg`     |  **3,999** | 15.99 ms | 12.35 ms | 89 ms | 60,036 / 60,036 |

100% delivery across all three. The HTTP layer accounts for roughly half of `memory`'s overhead — the library itself is much faster than that. `pg` is ~8× slower than `redis` because every `NOTIFY` round-trips through the database serializing on a single backend connection; that's not a library limitation, it's how `LISTEN/NOTIFY` works.

Reproduce locally (requires Docker + [k6](https://k6.io/docs/get-started/installation/)):

```sh
pnpm bench:memory
pnpm bench:redis
pnpm bench:pg
```

The full harness — bench HTTP server, testcontainer orchestrator, k6 scripts — is in [`apps/bench`](./apps/bench).

## Roadmap

- Middleware / interceptors on the `PubSub` facade.
- Schema validation (Zod/Valibot) helpers.
- Async-iterator API alongside RxJS.
- Browser adapter (BroadcastChannel + WebSocket).
- Community adapters: NATS, Kafka, RabbitMQ, MQTT.

## License

MIT
