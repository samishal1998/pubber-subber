# @pubber-subber/redis

Redis pub/sub adapter for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core) — built on [`ioredis`](https://github.com/redis/ioredis). Works with Redis, [Valkey](https://valkey.io), [KeyDB](https://docs.keydb.dev), [Dragonfly](https://dragonflydb.io), or any Redis-protocol-compatible server.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/redis ioredis
```

`ioredis` is a **peer dependency** — install it alongside.

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { redis } from '@pubber-subber/redis';

const pubsub = new PubSub({
  adapter: redis({ url: 'redis://localhost:6379' }),
});

await pubsub.subscribe('users.*', (msg) => {
  console.log(msg.topic, msg.payload);
});

await pubsub.publish('users.created', { id: 1, name: 'Alice' });
```

## Options

```ts
redis({
  url?: string;
  options?: RedisOptions;                            // ioredis-compatible
  clients?: { publisher: Redis; subscriber: Redis };
  codec?: Codec;
})
```

| Option | Notes |
| --- | --- |
| `url` | Standard Redis URL: `redis://[:password@]host:port[/db]`, `rediss://...` for TLS. |
| `options` | Full ioredis `RedisOptions`. Merged with `url`. |
| `clients` | Bring your own `{ publisher, subscriber }` pair. The adapter will **not** call `quit()` on them. `publisher` and `subscriber` must be distinct clients — Redis rejects non-pub/sub commands on a `SUBSCRIBE`-d connection. |
| `codec` | Payload encoder/decoder. Default `jsonCodec()`. |

## Publish meta

```ts
await pubsub.publish('orders.created', payload, { channel: 'orders' });
```

| Field | Notes |
| --- | --- |
| `channel` | Override the on-wire Redis channel without changing the logical `AdapterMessage.topic`. |

## Subscribe meta

```ts
await pubsub.subscribe('orders', handler, { pattern: true });
```

| Field | Default | Notes |
| --- | --- | --- |
| `pattern` | auto-detected | Force `PSUBSCRIBE` even if the topic has no `*` or `?`. Auto-detected from wildcards otherwise. |

## Capabilities

```ts
{ publish: true, subscribe: true, patternSubscribe: true, ack: false }
```

## How it works

- **Two internal connections**: one publisher, one subscriber. Required by Redis (a `SUBSCRIBE`-d connection cannot issue other commands).
- `subscribe(topic, handler)` issues `SUBSCRIBE` for exact channels and `PSUBSCRIBE` for patterns containing `*` or `?` (override via `meta.pattern: true`).
- **Reference-counted**: multiple `subscribe()` calls for the same channel only `SUBSCRIBE` once on the wire. `UNSUBSCRIBE` fires when the last handler goes away.
- **Reconnect**: `ioredis` handles socket-level reconnects automatically. On the `ready` event, the adapter re-subscribes every live channel and pattern — no user-visible message loss for events published *after* the reconnect completes.

## Caveats

- **Redis pub/sub is fire-and-forget.** Subscribers that fall behind have their messages dropped server-side. Events published while the subscriber is disconnected are not buffered. If you need delivery guarantees, use Redis Streams (different adapter — not in this package) or a different transport.
- **`capabilities.ack = false`**: there is no `ack`/`nack` to call on `AdapterMessage`.
- For high message-frequency scenarios, watch ioredis's `lazyConnect` and connection pool tuning.

## License

MIT
