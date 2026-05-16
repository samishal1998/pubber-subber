import { PubSub } from '@pubber-subber/core';
import { gcpPubSub } from '@pubber-subber/gcp-pubsub';

const projectId = process.env.PUBSUB_PROJECT_ID ?? 'test-project';
const topicName = process.env.PUBSUB_TOPIC ?? 'demo-topic';
const subscriptionName = process.env.PUBSUB_SUBSCRIPTION ?? 'demo-sub';

async function main(): Promise<void> {
  const pubsub = new PubSub({ adapter: gcpPubSub({ projectId }) });

  const sub = await pubsub.subscribe(
    topicName,
    (msg) => {
      console.log('received:', msg.payload, 'attributes:', msg.meta?.attributes);
    },
    {
      subscriptionName,
      createIfMissing: true,
      ephemeral: true,
    },
  );

  await pubsub.publish(
    topicName,
    { event: 'demo', at: new Date().toISOString() },
    { attributes: { source: 'pubber-subber-example' } },
  );

  // Give the receiver a moment to pull from the subscription.
  await new Promise((r) => setTimeout(r, 1500));
  await sub.unsubscribe();
  await pubsub.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
