import { PubSub } from '@pubber-subber/core';
import { redis } from '@pubber-subber/redis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function main(): Promise<void> {
  const pubsub = new PubSub({ adapter: redis({ url }) });

  // Two workers on the same channel — each receives every message.
  const workerA = await pubsub.subscribe('jobs.*', (msg) => {
    console.log(`[worker-a] ${msg.topic}:`, msg.payload);
  });
  const workerB = await pubsub.subscribe('jobs.*', (msg) => {
    console.log(`[worker-b] ${msg.topic}:`, msg.payload);
  });

  // Tiny grace period so PSUBSCRIBE registers on the server.
  await new Promise((r) => setTimeout(r, 100));

  await pubsub.publish('jobs.email', { to: 'a@example.com', body: 'hi' });
  await pubsub.publish('jobs.webhook', { url: 'https://hooks.example.com/42' });

  await new Promise((r) => setTimeout(r, 200));

  await workerA.unsubscribe();
  await workerB.unsubscribe();
  await pubsub.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
