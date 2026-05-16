# @pubber-subber/gcp-pubsub

[Google Cloud Pub/Sub](https://cloud.google.com/pubsub) adapter for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core). Backed by the official [`@google-cloud/pubsub`](https://www.npmjs.com/package/@google-cloud/pubsub) Node SDK.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/gcp-pubsub @google-cloud/pubsub
```

`@google-cloud/pubsub` is a **peer dependency**. Auth follows GCP defaults — `GOOGLE_APPLICATION_CREDENTIALS`, Workload Identity, etc.

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { gcpPubSub } from '@pubber-subber/gcp-pubsub';

const pubsub = new PubSub({
  adapter: gcpPubSub({ projectId: 'my-project' }),
});

await pubsub.subscribe(
  'users.created',
  (msg) => console.log(msg.payload, msg.meta?.attributes),
  {
    subscriptionName: 'workers-users-created',
    createIfMissing: true,
  },
);

await pubsub.publish(
  'users.created',
  { id: 1 },
  { attributes: { tenantId: 't1' }, orderingKey: 'user-1' },
);
```

## Options

```ts
gcpPubSub({
  projectId?: string;
  client?: GooglePubSub;             // pre-built @google-cloud/pubsub client
  options?: ClientConfig;
  codec?: Codec;
  subscriptionPrefix?: string;       // default: 'pubber'
})
```

| Option | Notes |
| --- | --- |
| `projectId` | GCP project. Falls back to `options.projectId` / SDK auto-detection. |
| `client` | Pre-constructed `PubSub` client from `@google-cloud/pubsub`. Useful when you want to share a client. |
| `options` | Full `ClientConfig` from the SDK (transport, scopes, etc.). |
| `codec` | Payload encoder/decoder. Default `jsonCodec()`. |
| `subscriptionPrefix` | Prefix for auto-generated subscription names when `subscriptionName` isn't provided. |

## Publish meta

```ts
await pubsub.publish('users.created', payload, {
  attributes: { tenantId: 't1' },
  orderingKey: 'user-1',
});
```

| Field | Notes |
| --- | --- |
| `attributes` | `Record<string, string>`, forwarded to Pub/Sub message attributes. |
| `orderingKey` | Forwarded as the ordering key. Requires the topic to have message ordering enabled. |

## Subscribe meta

```ts
await pubsub.subscribe('users.created', handler, {
  subscriptionName: 'workers-users-created',
  createIfMissing: true,
});
```

| Field | Notes |
| --- | --- |
| `subscriptionName` | Existing subscription. **Required for production** — every worker must share the same subscription name to load-balance message processing. If omitted, a unique per-process name is generated (suitable for dev / one-off scripts only). |
| `createIfMissing` | Create the subscription on demand if it doesn't exist. Useful for ephemeral or dev subscriptions. |
| `subscriptionOptions` | Forwarded to `topic.createSubscription()` (e.g. `ackDeadlineSeconds`, `messageRetentionDuration`). |
| `ephemeral` | Delete the subscription on `unsubscribe`. Use in tests; **never** in production. |

## Capabilities

```ts
{ publish: true, subscribe: true, patternSubscribe: false, ack: true }
```

## Ack semantics

- Handler returns successfully → `message.ack()`.
- Handler throws → `message.nack()`. The server redelivers per the subscription's retry policy.
- For manual control, call `msg.ack()` or `msg.nack()` inside your handler. The adapter tracks whether either was called and skips the auto-resolve to avoid double-ack.

## Notes

- Topic names use Pub/Sub's standard format. The adapter passes them through as-is — you can use bare names like `users.created` (resolved against the configured project) or fully qualified `projects/my-project/topics/users.created`.
- For local development, the [Pub/Sub emulator](https://cloud.google.com/pubsub/docs/emulator) works out of the box: set `PUBSUB_EMULATOR_HOST=localhost:8085` and the SDK routes to it automatically.
- The adapter doesn't auto-create topics — only subscriptions (via `createIfMissing`). Topics should exist before you publish.

## License

MIT
