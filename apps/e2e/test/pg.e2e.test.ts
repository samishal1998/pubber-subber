import { runConformance } from '@pubber-subber/core/testing';
import { pg } from '@pubber-subber/pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll } from 'vitest';
import { runRxjsSuite } from '../src/rxjs-suite.js';

let container: StartedPostgreSqlContainer | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
}, 180_000);

afterAll(async () => {
  if (container) {
    await container.stop();
    container = undefined;
  }
});

const connectionString = (): string => {
  if (!container) throw new Error('Postgres container not started');
  return container.getConnectionUri();
};

runConformance({
  name: 'pg pub/sub contract (postgres:16)',
  createAdapter: () => pg({ connectionString: connectionString() }),
  // Postgres LISTEN/NOTIFY has no wildcards.
  skip: { patternSubscribe: true },
  deliveryTimeoutMs: 8000,
  quietWindowMs: 800,
});

runRxjsSuite({
  name: 'pg',
  createAdapter: () => pg({ connectionString: connectionString() }),
  // LISTEN needs a moment after subscribe before the server forwards NOTIFYs.
  subscribeSettleMs: 200,
  publishGapMs: 10,
  deliveryTimeoutMs: 5000,
});
