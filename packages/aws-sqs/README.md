# @pubber-subber/aws-sqs

AWS SQS **subscribe-only** adapter for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core). Backed by [`@aws-sdk/client-sqs`](https://www.npmjs.com/package/@aws-sdk/client-sqs).

Long-polls a queue, delivers messages to your handler, auto-acks on success and nacks on failure. Unwraps SNS notification envelopes transparently for SNS → SQS pipelines.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/aws-sqs @aws-sdk/client-sqs
```

`@aws-sdk/client-sqs` is a **peer dependency**. AWS auth follows the SDK's default credential chain.

## Quick start

```ts
import { PubSub } from '@pubber-subber/core';
import { awsSqs } from '@pubber-subber/aws-sqs';

const pubsub = new PubSub({
  adapter: awsSqs({
    region: 'us-east-1',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/000000000000/orders',
  }),
});

await pubsub.subscribe('orders', (msg) => {
  console.log(msg.payload);          // SNS envelope auto-unwrapped if present
  // call msg.ack() / msg.nack() manually if you need fine control
});
```

## Pair with SNS for full-duplex

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

(The SNS → SQS subscription must already be wired — typically via Terraform/CDK.)

## Options

```ts
awsSqs({
  region?: string;
  queueUrl?: string;            // default for subscribes
  client?: SQSClient;
  options?: SQSClientConfig;
  codec?: Codec;
})
```

| Option | Notes |
| --- | --- |
| `region` | AWS region. |
| `queueUrl` | Default queue URL — used when `meta.queueUrl` isn't passed on subscribe. |
| `client` | Pre-constructed `SQSClient`. |
| `options` | Full `SQSClientConfig` (endpoint override for LocalStack, retry strategy, etc.). |
| `codec` | Payload encoder/decoder. Default `jsonCodec()`. |

## Subscribe meta

```ts
await pubsub.subscribe('orders', handler, {
  queueUrl: 'https://...',
  waitTimeSeconds: 20,
  maxMessages: 10,
  handlerConcurrency: 5,
});
```

| Field | Default | Notes |
| --- | --- | --- |
| `queueUrl` | `opts.queueUrl` | One of the two **must** be set, otherwise `SubscriptionError` is thrown. |
| `waitTimeSeconds` | 20 | SQS long-poll wait. 0–20. Higher → fewer empty receives, lower API cost. |
| `maxMessages` | 10 | Per `ReceiveMessage` batch. 1–10. |
| `visibilityTimeout` | (queue default) | Override per subscription. |
| `handlerConcurrency` | 5 | Maximum in-flight handler invocations. Increase for I/O-bound handlers. |

## Capabilities

```ts
{ publish: false, subscribe: true, patternSubscribe: false, ack: true }
```

Calling `publish()` throws `NotSupportedError` with a pointer to `@pubber-subber/aws-sns` + `compose()`.

## Ack semantics

- Handler resolves → `DeleteMessage` (ack).
- Handler throws → `ChangeMessageVisibility(VisibilityTimeout=0)` so the message is immediately retried (nack).
- For manual control, call `msg.ack()` or `msg.nack()` inside your handler. The adapter tracks whether either was called and skips the auto-resolve to avoid double-ack.

## SNS → SQS envelope unwrapping

If a message's Body is an SNS notification envelope:

```json
{ "Type": "Notification", "MessageId": "...", "Message": "<inner>", "MessageAttributes": {...} }
```

the adapter:

- decodes the inner `Message` through the codec (so the JSON SNS publishes is unwrapped to your original payload),
- exposes the SNS attributes on `AdapterMessage.meta.snsAttributes`.

Your handler sees the original payload, not the envelope.

## Notes

- The receive loop runs in the background; `unsubscribe()` halts it and drains any in-flight handler invocations before resolving.
- For FIFO queues, set `meta.maxMessages = 1` and `meta.handlerConcurrency = 1` to preserve ordering.
- LocalStack: pass `options: { endpoint: 'http://localhost:4566' }`.

## License

MIT
