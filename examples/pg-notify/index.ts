import { PubSub } from '@pubber-subber/core';
import { pg } from '@pubber-subber/pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

async function main(): Promise<void> {
  const pubsub = new PubSub({ adapter: pg({ connectionString }) });

  const sub = await pubsub.subscribe('outbox.processed', (msg) => {
    console.log('received via LISTEN/NOTIFY:', msg.payload);
  });

  // Give LISTEN a tick to register.
  await new Promise((r) => setTimeout(r, 100));

  await pubsub.publish('outbox.processed', { outboxId: 42, status: 'ok' });

  await new Promise((r) => setTimeout(r, 200));
  await sub.unsubscribe();
  await pubsub.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
