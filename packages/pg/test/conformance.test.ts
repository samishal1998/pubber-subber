import { runConformance } from '@pubber-subber/core/testing';
import { describe, it } from 'vitest';
import { pg } from '../src/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  runConformance({
    name: 'pg',
    createAdapter: () => pg({ connectionString: DATABASE_URL }),
    // pg LISTEN/NOTIFY has no native wildcards.
    skip: { patternSubscribe: true },
    deliveryTimeoutMs: 5000,
    quietWindowMs: 400,
  });
} else {
  describe('conformance: pg (skipped — set DATABASE_URL to enable)', () => {
    it.skip('skipped', () => undefined);
  });
}
