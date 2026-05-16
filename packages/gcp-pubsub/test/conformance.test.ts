import { PubSub as GooglePubSub } from '@google-cloud/pubsub';
import { runConformance } from '@pubber-subber/core/testing';
import { describe, it } from 'vitest';
import { gcpPubSub } from '../src/index.js';

const projectId = process.env.PUBSUB_PROJECT_ID;
const enabled = !!projectId && !!process.env.PUBSUB_EMULATOR_HOST;

if (enabled) {
  runConformance({
    name: 'gcp-pubsub',
    createAdapter: async () => {
      const client = new GooglePubSub({ projectId });
      // The conformance suite creates fresh topics; ensure topic exists per test.
      return gcpPubSub({
        client,
        // We rely on createIfMissing for tests so subscriptions auto-spawn.
      });
    },
    skip: { patternSubscribe: true },
    deliveryTimeoutMs: 8000,
    quietWindowMs: 600,
    uniqueTopic: (base) => `${base}-${process.pid}-${Date.now()}`,
  });
} else {
  describe('conformance: gcp-pubsub (skipped — set PUBSUB_EMULATOR_HOST + PUBSUB_PROJECT_ID)', () => {
    it.skip('skipped', () => undefined);
  });
}
