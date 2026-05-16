# memory-basic

In-process pub/sub. Demonstrates exact-topic subscriptions, glob pattern subscriptions, and clean teardown. No services required.

```sh
pnpm start
```

Expected output:

```
[exact] users.created: { id: 1, name: 'Alice' }
[wild ] users.created: { id: 1, name: 'Alice' }
[wild ] users.updated: { id: 1, name: 'Alice (edited)' }
```

`orders.created` is published but no one subscribes to it.
