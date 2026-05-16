import { runConformance } from '@pubber-subber/core/testing';
import { describe, it } from 'vitest';
import { redis } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  runConformance({
    name: 'redis',
    createAdapter: () => redis({ url: REDIS_URL }),
    // Redis pub/sub fans out asynchronously over a TCP connection; bump windows.
    deliveryTimeoutMs: 5000,
    quietWindowMs: 400,
  });
} else {
  describe('conformance: redis (skipped — set REDIS_URL to enable)', () => {
    it.skip('skipped', () => undefined);
  });
}
