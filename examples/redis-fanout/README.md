# redis-fanout

Two workers subscribe to `jobs.*` and both receive every published message. Demonstrates Redis pattern subscribe and reliable fan-out.

## Run

```sh
docker run --rm -d -p 6379:6379 redis:7
pnpm start
```

Override the URL via `REDIS_URL`.
