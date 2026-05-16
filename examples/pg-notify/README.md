# pg-notify

Postgres LISTEN/NOTIFY. Publish on the same connection (works because of pubber-subber's facade lazily wiring `LISTEN` once per channel).

## Run

```sh
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
pnpm start
```

Override the connection string via `DATABASE_URL`.
