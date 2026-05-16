import { awsSns } from '@pubber-subber/aws-sns';
import { awsSqs } from '@pubber-subber/aws-sqs';
import { PubSub, compose } from '@pubber-subber/core';

const region = process.env.AWS_REGION ?? 'us-east-1';
const topicArn = process.env.SNS_TOPIC_ARN;
const queueUrl = process.env.SQS_QUEUE_URL;
const endpoint = process.env.AWS_ENDPOINT_URL;

if (!topicArn || !queueUrl) {
  console.error('Set SNS_TOPIC_ARN and SQS_QUEUE_URL. See README.');
  process.exit(1);
}

async function main(): Promise<void> {
  const pubsub = new PubSub({
    adapter: compose({
      publisher: awsSns({
        region,
        topicArn,
        options: endpoint ? { endpoint } : undefined,
      }),
      subscriber: awsSqs({
        region,
        queueUrl,
        options: endpoint ? { endpoint } : undefined,
      }),
    }),
  });

  const sub = await pubsub.subscribe('orders', (msg) => {
    console.log('received order:', msg.payload, 'sns attrs:', msg.meta?.snsAttributes);
  });

  await pubsub.publish(
    'orders',
    { id: 1, total: 4200 },
    {
      messageAttributes: {
        kind: { DataType: 'String', StringValue: 'order' },
      },
    },
  );

  // SQS long-poll → give it a moment.
  await new Promise((r) => setTimeout(r, 2500));
  await sub.unsubscribe();
  await pubsub.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
