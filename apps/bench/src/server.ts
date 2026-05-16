import { createServer } from 'node:http';
import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';
import { pg } from '@pubber-subber/pg';
import { redis } from '@pubber-subber/redis';

type Adapter = 'memory' | 'redis' | 'pg';

const ADAPTER = (process.env.ADAPTER ?? 'memory') as Adapter;
const PORT = Number(process.env.PORT ?? 3210);
const BENCH_TOPIC = process.env.BENCH_TOPIC ?? 'bench';

function makeAdapter() {
  switch (ADAPTER) {
    case 'memory':
      return memory();
    case 'redis': {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error('REDIS_URL is required for the redis adapter');
      return redis({ url });
    }
    case 'pg': {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL is required for the pg adapter');
      }
      return pg({ connectionString });
    }
    default:
      throw new Error(`Unknown adapter: ${ADAPTER}`);
  }
}

interface Stats {
  publishCount: number;
  receivedCount: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  startedAt: number;
}

const stats: Stats = {
  publishCount: 0,
  receivedCount: 0,
  totalLatencyMs: 0,
  maxLatencyMs: 0,
  startedAt: Date.now(),
};

const pubsub = new PubSub({ adapter: makeAdapter() });
await pubsub.connect();

await pubsub.subscribe(BENCH_TOPIC, (msg) => {
  const payload = msg.payload as { t?: number } | null;
  const sentAt = payload?.t;
  if (typeof sentAt === 'number') {
    const latency = Date.now() - sentAt;
    stats.receivedCount += 1;
    stats.totalLatencyMs += latency;
    if (latency > stats.maxLatencyMs) stats.maxLatencyMs = latency;
  }
});

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end();
    return;
  }
  try {
    if (req.url === '/publish' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks).toString('utf8');
      const payload = body ? JSON.parse(body) : {};
      payload.t = Date.now();
      await pubsub.publish(BENCH_TOPIC, payload);
      stats.publishCount += 1;
      res.writeHead(202).end();
      return;
    }
    if (req.url === '/metrics' && req.method === 'GET') {
      const elapsed = (Date.now() - stats.startedAt) / 1000;
      const body = JSON.stringify(
        {
          adapter: ADAPTER,
          elapsedSec: Number(elapsed.toFixed(3)),
          publishCount: stats.publishCount,
          receivedCount: stats.receivedCount,
          publishesPerSec: elapsed > 0 ? Math.round(stats.publishCount / elapsed) : 0,
          receivesPerSec: elapsed > 0 ? Math.round(stats.receivedCount / elapsed) : 0,
          avgLatencyMs:
            stats.receivedCount > 0
              ? Number((stats.totalLatencyMs / stats.receivedCount).toFixed(2))
              : 0,
          maxLatencyMs: stats.maxLatencyMs,
        },
        null,
        2,
      );
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
      return;
    }
    if (req.url === '/reset' && req.method === 'POST') {
      stats.publishCount = 0;
      stats.receivedCount = 0;
      stats.totalLatencyMs = 0;
      stats.maxLatencyMs = 0;
      stats.startedAt = Date.now();
      res.writeHead(204).end();
      return;
    }
    if (req.url === '/healthz') {
      res.writeHead(200).end('ok');
      return;
    }
    res.writeHead(404).end();
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
  }
});

server.listen(PORT, () => {
  console.log(`bench server (adapter=${ADAPTER}) listening on :${PORT}`);
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await pubsub.disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
