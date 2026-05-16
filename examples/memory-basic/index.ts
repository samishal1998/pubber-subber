import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';

interface UserCreated {
  id: number;
  name: string;
}

async function main(): Promise<void> {
  const pubsub = new PubSub({ adapter: memory() });

  const sub = await pubsub.subscribe<UserCreated>('users.created', (msg) => {
    console.log(`[exact] ${msg.topic}:`, msg.payload);
  });

  const wildcardSub = await pubsub.subscribe('users.*', (msg) => {
    console.log(`[wild ] ${msg.topic}:`, msg.payload);
  });

  await pubsub.publish('users.created', { id: 1, name: 'Alice' });
  await pubsub.publish('users.updated', { id: 1, name: 'Alice (edited)' });
  await pubsub.publish('orders.created', { id: 99 });

  await sub.unsubscribe();
  await wildcardSub.unsubscribe();
  await pubsub.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
