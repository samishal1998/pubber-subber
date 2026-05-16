# @pubber-subber/aws-sns

AWS SNS **publish-only** adapter for [`@pubber-subber/core`](https://www.npmjs.com/package/@pubber-subber/core). Backed by [`@aws-sdk/client-sns`](https://www.npmjs.com/package/@aws-sdk/client-sns).

SNS publishes; subscriptions are server-side (HTTP endpoints, SQS, Lambda, mobile push, email, SMS) and lie outside the in-process world this library covers. Pair this adapter with [`@pubber-subber/aws-sqs`](https://www.npmjs.com/package/@pubber-subber/aws-sqs) via `compose()` from `@pubber-subber/core` to get SNS → SQS fan-out with a single duplex `PubSub` interface.

## Install

```sh
pnpm add @pubber-subber/core @pubber-subber/aws-sns @aws-sdk/client-sns
```

`@aws-sdk/client-sns` is a **peer dependency**. AWS auth follows the SDK's default credential chain.

## Quick start — publish only

```ts
import { PubSub } from '@pubber-subber/core';
import { awsSns } from '@pubber-subber/aws-sns';

const pubsub = new PubSub({ adapter: awsSns({ region: 'us-east-1' }) });

await pubsub.publish('arn:aws:sns:us-east-1:000000000000:orders', { id: 1 });
```

## Quick start — duplex via SNS → SQS

```ts
import { PubSub, compose } from '@pubber-subber/core';
import { awsSns } from '@pubber-subber/aws-sns';
import { awsSqs } from '@pubber-subber/aws-sqs';

const pubsub = new PubSub({
  adapter: compose({
    publisher: awsSns({ region: 'us-east-1' }),
    subscriber: awsSqs({
      region: 'us-east-1',
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/000000000000/orders',
    }),
  }),
});

await pubsub.subscribe('orders', (msg) => handle(msg.payload));
await pubsub.publish('arn:aws:sns:us-east-1:000000000000:orders', { id: 1 });
```

(The SNS topic must already be subscribed to the SQS queue — typically via Terraform/CDK; the adapter doesn't manage that wiring.)

## Options

```ts
awsSns({
  region?: string;
  topicArn?: string;              // default TopicArn for publishes
  client?: SNSClient;             // pre-built client
  options?: SNSClientConfig;
  codec?: Codec;
})
```

| Option | Notes |
| --- | --- |
| `region` | AWS region. |
| `topicArn` | Default TopicArn used when the `topic` argument isn't already an ARN and `meta.topicArn` isn't set. |
| `client` | Pre-constructed `SNSClient`. Useful for sharing a client. |
| `options` | Full `SNSClientConfig` from `@aws-sdk/client-sns` (custom endpoint, credentials, retry strategy, etc.). |
| `codec` | Payload encoder/decoder. Default `jsonCodec()`. |

## Publish meta

```ts
await pubsub.publish(topicArn, payload, {
  messageAttributes: { tenantId: { DataType: 'String', StringValue: 't1' } },
  subject: 'New User',
  messageGroupId: 'group-1',          // FIFO topics
  messageDeduplicationId: 'dedupe-1', // FIFO topics
});
```

| Field | Notes |
| --- | --- |
| `topicArn` | Override the TopicArn for this publish. |
| `targetArn` | SNS `TargetArn` (mobile push endpoints). |
| `phoneNumber` | SMS recipient. |
| `messageAttributes` | Forwarded to SNS `MessageAttributes`. |
| `messageGroupId` | FIFO topics only — message group key. |
| `messageDeduplicationId` | FIFO topics only — deduplication key. |
| `subject` | SNS `Subject` (used as the email subject for email subscriptions). |

## TopicArn resolution

The `topic` argument to `pubsub.publish()` is treated as:

1. The TopicArn directly if it begins with `arn:aws:sns:`.
2. `opts.topicArn` otherwise (set when constructing the adapter).
3. `meta.topicArn` if you want to override per call.

## Capabilities

```ts
{ publish: true, subscribe: false, patternSubscribe: false, ack: false }
```

Calling `subscribe()` throws `NotSupportedError` with a pointer to `compose()` + `@pubber-subber/aws-sqs`.

## License

MIT
