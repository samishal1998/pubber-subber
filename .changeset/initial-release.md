---
'@pubber-subber/core': minor
'@pubber-subber/memory': minor
'@pubber-subber/redis': minor
'@pubber-subber/pg': minor
'@pubber-subber/gcp-pubsub': minor
'@pubber-subber/aws-sns': minor
'@pubber-subber/aws-sqs': minor
'@pubber-subber/rxjs': minor
---

Initial release.

- `@pubber-subber/core`: adapter contract, `PubSub` facade, codecs (`jsonCodec`, `passthroughCodec`), error hierarchy, `compose()` helper, glob `matchTopic`, conformance test kit exported from `/testing`.
- `@pubber-subber/memory`: zero-dep in-process adapter with pattern matching and `structuredClone`-by-default payloads.
- `@pubber-subber/redis`: ioredis-backed adapter with split publisher/subscriber connections, `SUBSCRIBE` + `PSUBSCRIBE`, automatic re-subscribe on reconnect, BYO-clients escape hatch.
- `@pubber-subber/pg`: node-postgres `LISTEN/NOTIFY` adapter with channel-name hashing for over-limit topics, payload-size guard, parameterized `pg_notify`.
- `@pubber-subber/gcp-pubsub`: Google Cloud Pub/Sub adapter with attribute/orderingKey publish meta, `createIfMissing` + `ephemeral` subscribe meta, manual or auto ack/nack.
- `@pubber-subber/aws-sns`: publish-only SNS adapter with full PublishCommand meta surface.
- `@pubber-subber/aws-sqs`: subscribe-only SQS adapter with long polling, configurable concurrency, auto-ack/nack, SNS-envelope unwrapping, manual ack via `AdapterMessage.ack`.
- `@pubber-subber/rxjs`: optional `toObservable` / `fromTopic` bridge with cancellation-race-safe teardown.
