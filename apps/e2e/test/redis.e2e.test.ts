import { runConformance } from '@pubber-subber/core/testing';
import { redis } from '@pubber-subber/redis';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll } from 'vitest';
import { runRxjsSuite } from '../src/rxjs-suite.js';

let container: StartedRedisContainer | undefined;

beforeAll(async () => {
  container = await new RedisContainer('redis:7-alpine').start();
}, 120_000);

afterAll(async () => {
  if (container) {
    await container.stop();
    container = undefined;
  }
});

const url = (): string => {
  if (!container) throw new Error('Redis container not started');
  return container.getConnectionUrl();
};

runConformance({
  name: 'redis pub/sub contract (redis:7)',
  createAdapter: () => redis({ url: url() }),
  deliveryTimeoutMs: 8000,
  quietWindowMs: 800,
});

runRxjsSuite({
  name: 'redis',
  createAdapter: () => redis({ url: url() }),
  // SUBSCRIBE round-trip on a local Redis is fast but non-zero.
  subscribeSettleMs: 150,
  publishGapMs: 5,
  deliveryTimeoutMs: 5000,
});
