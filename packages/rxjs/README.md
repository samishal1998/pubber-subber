# @pubber-subber/rxjs

Optional RxJS bridge for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core). Turn any topic subscription into an `Observable`. Works with every adapter — the bridge is transport-agnostic.

The bridge is intentionally a separate package so the core stays dependency-free for apps that don't use RxJS.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/rxjs rxjs
```

`rxjs` is a **peer dependency**. Supports RxJS 7 and 8.

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';
import { fromTopic } from '@pubber-subber/rxjs';

const pubsub = new PubSub({ adapter: memory() });

const sub = fromTopic<{ id: number }>(pubsub, 'users.created')
  .subscribe((user) => console.log(user.id));

await pubsub.publish('users.created', { id: 1 });

sub.unsubscribe();    // tears down the underlying pubsub subscription too
```

## API

```ts
toObservable<T>(pubsub, topic, meta?): Observable<AdapterMessage<T>>
fromTopic<T>(pubsub, topic, meta?): Observable<T>
```

- **`toObservable`** emits the full `AdapterMessage` envelope — `topic`, `payload`, `raw`, `meta`, optional `ack`/`nack`. Use it when you need the envelope.
- **`fromTopic`** unwraps to just `payload` — the convenience choice when you don't care about the envelope.

Both lazy-create the underlying pubsub subscription on the first observer attach and tear it down on the last unsubscribe.

## Pipelines

The whole point of the bridge is composing with RxJS operators:

```ts
import { fromTopic } from '@pubber-subber/rxjs';
import { bufferTime, filter, mergeMap } from 'rxjs';

interface PageView { user: string; path: string; ts: number; }

fromTopic<PageView>(pubsub, 'analytics.pageview')
  .pipe(
    filter((v) => !v.path.startsWith('/internal')),
    bufferTime(250),
    mergeMap((batch) => writeBatch(batch)),
  )
  .subscribe();
```

## Notes

- **Cancellation race**: teardown is safe even if it races with the initial `subscribe()` call — the bridge tracks a cancellation flag and unsubscribes upstream as soon as it resolves. Subscribing and immediately unsubscribing never throws or leaks.
- **No `.observe()` on `PubSub`**: adding it would pull RxJS types into core. The function form keeps the coupling one-way; apps that don't use RxJS pay no cost.
- **Multi-subscriber**: each Observable subscription creates its own underlying pubsub subscription. For transports that fan out anyway (Redis pub/sub, in-memory) this is the expected behavior. For transports with shared subscriptions (GCP Pub/Sub, SQS) this means messages distribute across observers per the broker's semantics.
- **Errors**: errors from the underlying `pubsub.subscribe()` are emitted via `subscriber.error()`. Errors thrown from RxJS operators bubble up the pipeline as usual; they don't propagate back into the pubsub subscription.

## License

MIT
