# @pubber-subber/pg

Postgres `LISTEN/NOTIFY` pub/sub adapter for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core). Built on [`pg`](https://node-postgres.com/) (node-postgres).

If you already operate a Postgres database, this gives you adequate-throughput pub/sub with zero additional infrastructure — no Redis, no broker, no extra ops surface area.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/pg pg
```

`pg` is a **peer dependency**.

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { pg } from '@pubber-subber/pg';

const pubsub = new PubSub({
  adapter: pg({ connectionString: 'postgres://user:pass@host:5432/db' }),
});

await pubsub.subscribe('outbox.processed', (msg) => {
  console.log(msg.payload);
});

await pubsub.publish('outbox.processed', { outboxId: 42, status: 'ok' });
```

## Options

```ts
pg({
  connectionString?: string;
  config?: ClientConfig;          // full pg.ClientConfig
  client?: Client;                // bring-your-own
  codec?: Codec;
})
```

| Option | Notes |
| --- | --- |
| `connectionString` | Standard libpq connection string. |
| `config` | Full `pg.ClientConfig`. Merged with `connectionString`. |
| `client` | Bring-your-own `pg.Client`. The adapter will **not** call `connect()` / `end()` on it — useful when you want explicit lifecycle control. |
| `codec` | Payload encoder/decoder. Default `jsonCodec()`. |

## Publish meta

| Field | Notes |
| --- | --- |
| `channel` | Override the wire channel for this publish. The logical topic stays on `AdapterMessage.topic`. |

## Subscribe meta

| Field | Notes |
| --- | --- |
| `channel` | Override the wire channel. |

## Capabilities

```ts
{ publish: true, subscribe: true, patternSubscribe: false, ack: false }
```

## Postgres-specific constraints

These come from Postgres itself, not the adapter — understand them before betting your architecture on `LISTEN/NOTIFY`:

- **Channel names are limited to 63 bytes.** Topics longer than that are hashed deterministically to `pubsub_<sha256[:32]>` and an internal map preserves the original logical topic on delivery. Pass `meta.channel` to override explicitly.
- **`NOTIFY` payloads max ~8000 bytes.** The adapter rejects encoded payloads above ~7500 bytes (leaves room for protocol overhead) with `PublishError`. The recommended pattern is to publish a reference (e.g. row id) and resolve the body via `SELECT` in the subscriber.
- **No wildcards.** `LISTEN` doesn't support patterns. `capabilities.patternSubscribe = false`; pattern topics like `users.*` fail unless you build a server-side fanout trigger function yourself.
- **One dedicated `pg.Client` per adapter instance** is used so LISTEN traffic does not block other queries on the same connection. Re-use your existing connection pool for query traffic.
- **No SQL injection risk** regardless of topic name — publishes use parameterized `SELECT pg_notify($1, $2)`; LISTEN/UNLISTEN quote and escape the channel identifier (`LISTEN "users.created"`).

## Caveats

- **`LISTEN/NOTIFY` is fire-and-forget.** Messages published while the subscriber is disconnected are not buffered. If you need durability, write to an outbox table and `NOTIFY` the row id.
- Pub/sub throughput is limited by the single LISTEN connection's NOTIFY processing — significantly lower than dedicated brokers like Redis. See the benchmarks in the project root for measurements.

## License

MIT
