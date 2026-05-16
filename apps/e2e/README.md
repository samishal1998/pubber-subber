# @pubber-subber/e2e

End-to-end conformance tests. Spins up real Redis and Postgres containers via [Testcontainers](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/) and runs the same `runConformance` suite that the per-package unit tests use — proving every built-in adapter satisfies the contract against an actual server.

## Requirements

- **Docker must be running** (Docker Desktop, Colima, OrbStack, or rootless docker — anything Testcontainers can talk to).
- Node 20.11+.

## Run

```sh
# All three suites (memory, redis, pg). Sequential — one container at a time.
pnpm e2e

# Or target one:
pnpm --filter @pubber-subber/e2e test:memory
pnpm --filter @pubber-subber/e2e test:redis
pnpm --filter @pubber-subber/e2e test:pg
```

The first run pulls `redis:7-alpine` and `postgres:16-alpine`; subsequent runs reuse the cached images.

## What's tested

The shared conformance suite from `@pubber-subber/core/testing` exercises:

- single message round-trip
- fan-out to multiple subscribers
- subscribers added **after** publish don't see backfill
- unsubscribe stops delivery
- metadata pass-through to handlers
- pattern subscriptions (memory + redis only — pg `LISTEN/NOTIFY` has no wildcards, so the pg suite skips that assertion)

## Source-mapped imports

The vitest config aliases `@pubber-subber/*` imports to each package's `src/index.ts`, so e2e tests run against fresh source without needing `pnpm -r build` first.

## CI

This suite is the same one wired into `.github/workflows/ci.yml` under the `integration` job (which runs `pnpm test:integration` against pre-provisioned services — Testcontainers in CI is an alternative if those services aren't desirable). To switch CI over to this suite, replace the `integration` job's `services:` block with a single `pnpm e2e` step on the same runner — Docker is available on `ubuntu-latest`.
