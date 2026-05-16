# @pubber-subber/bench

HTTP throughput benchmark for the pubber-subber adapters, driven by [k6](https://k6.io/). A small Node.js HTTP service wraps the library; k6 sends sustained `POST /publish` traffic; the server records pub→subscribe latency by stamping each payload with `t = Date.now()` and computing the delta when its own subscriber receives the message.

## Requirements

- Node 20.11+
- Docker (for the redis / pg variants — Testcontainers manages the lifecycle)
- k6 installed locally:
  - macOS: `brew install k6`
  - Linux / Windows: see <https://k6.io/docs/get-started/installation/>

## Run

```sh
pnpm bench:memory          # 15s sustained, 50 VUs, in-process adapter
pnpm bench:redis           # spawns redis:7-alpine, 15s sustained
pnpm bench:pg              # spawns postgres:16-alpine, 15s sustained
pnpm bench:memory:burst    # ramping-arrival-rate burst (k6/burst.js)
pnpm bench:redis:burst
pnpm bench:pg:burst
```

Each script:

1. ensures k6 is installed (helpful error if not)
2. builds `@pubber-subber/core` + the chosen adapter package
3. spins up the backing container (if needed)
4. starts the bench HTTP server on `:3210`
5. waits for `/healthz`, then resets stats counters
6. invokes `k6 run k6/publish.js` (or `k6/burst.js`)
7. reads server-side `/metrics`
8. shuts everything down

## Output

**From k6**: HTTP request rate, request duration (avg / med / p95 / p99 / max), iteration count, failure rate, threshold pass/fail.

**From the server**: `publishesPerSec`, `receivesPerSec`, `avgLatencyMs`, `maxLatencyMs` for the publish→subscribe round-trip — the metric that actually reflects the adapter's behavior, since `http_req_duration` only covers the HTTP side.

## Server endpoints

The server (`src/server.ts`) is the most useful piece on its own:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/publish` | Publishes the JSON body (server stamps `t` before publishing). |
| POST | `/reset` | Zeroes stats counters. |
| GET | `/metrics` | Counts + latency stats. |
| GET | `/healthz` | Liveness. |

Run it standalone:

```sh
ADAPTER=memory pnpm --filter @pubber-subber/bench server
ADAPTER=redis REDIS_URL=redis://localhost:6379 pnpm --filter @pubber-subber/bench server
ADAPTER=pg DATABASE_URL=postgres://... pnpm --filter @pubber-subber/bench server
```

## Caveats

- The library only adds a thin HTTP wrapper; k6's HTTP metrics include Node.js HTTP server overhead, not just the adapter. For pure-library numbers, look at `avgLatencyMs` from `/metrics`.
- pg LISTEN/NOTIFY caps each payload at ~8KB and serializes via a single backend connection per process — its throughput ceiling is well below Redis. The bench reflects that.
- Redis pub/sub is fire-and-forget. If a subscriber falls behind, messages are dropped server-side. The server counts `publishCount` independently of `receivedCount` — divergence is the visibility into that.
- Don't infer "library overhead" from `bench:memory`'s HTTP numbers. For a microbenchmark of the in-memory adapter without HTTP in the way, see the package unit tests; an in-process benchmark using `mitata` or `tinybench` is a reasonable follow-up.

## Docker-based k6 (if you don't want to install)

```sh
# On macOS, route Docker → host via host.docker.internal:
ADAPTER=memory pnpm --filter @pubber-subber/bench server &
docker run --rm -i \
  --add-host=host.docker.internal:host-gateway \
  -e BASE_URL=http://host.docker.internal:3210 \
  grafana/k6 run - < apps/bench/k6/publish.js
```

The orchestrator (`src/run.ts`) doesn't currently take this path — extend `ensureK6` / `runK6` if you need the bench scripts themselves to use Docker.
