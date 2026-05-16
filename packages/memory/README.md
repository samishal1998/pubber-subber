# @pubber-subber/memory

In-process pub/sub adapter for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core). EventEmitter-style fan-out, glob pattern subscriptions, payload cloning, zero external dependencies.

Use it in tests, in single-process apps, and as the default when no real broker is configured.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/memory
```

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';

const pubsub = new PubSub({ adapter: memory() });

await pubsub.subscribe('users.*', (msg) => {
  console.log(msg.topic, msg.payload);
});

await pubsub.publish('users.created', { id: 1, name: 'Alice' });
await pubsub.publish('users.updated', { id: 1, name: 'Alice (edited)' });
```

## Options

```ts
memory({ rawPayloads?: boolean })
```

| Option | Default | Notes |
| --- | --- | --- |
| `rawPayloads` | `false` | If `true`, subscribers receive the publisher's exact object reference. Default is to `structuredClone()` so subscribers can't accidentally mutate the publisher's data. Set `true` when your payloads are immutable, expensive to clone, or contain non-cloneable values (functions, class instances). |

## Capabilities

```ts
{ publish: true, subscribe: true, patternSubscribe: true, ack: false }
```

## Pattern matching

Built-in glob matcher (no external dependency):

| Pattern | Matches | Notes |
| --- | --- | --- |
| `*` | any run of characters within a topic segment | won't cross `.` |
| `**` | any run of characters across segments | greedy |
| `?` | exactly one character within a segment | won't match `.` |

```ts
await pubsub.subscribe('users.*',  handler);  // users.created, users.updated; NOT users.created.email
await pubsub.subscribe('users.**', handler);  // users.created, users.created.email, ...
await pubsub.subscribe('user?',    handler);  // user1, users
```

## Metadata

The memory adapter forwards any object as `AdapterMessage.meta` and as the second handler argument, but doesn't interpret it. Use it for tracing, tenant IDs, correlation IDs, or anything else you'd like to thread through.

```ts
await pubsub.subscribe('t', (msg, meta) => {
  // msg.meta === { traceId: 'abc' }
  // meta     === undefined
}, /* no subscribe meta */);

await pubsub.publish('t', payload, { traceId: 'abc' });
```

## Behavior

- **Fire-and-forget but synchronous-ish.** `publish()` awaits each subscriber's handler in order before resolving. Memory has no in-flight buffer or backpressure — when `publish()` resolves, every live subscriber has been called.
- **No replay.** Subscribers added *after* a publish do not see backfill (consistent with pub/sub semantics across the ecosystem).
- **Handler errors don't break delivery.** If one subscriber throws, the others still receive the message. Errors surface via the facade's `onError` callback if set.

## License

MIT
