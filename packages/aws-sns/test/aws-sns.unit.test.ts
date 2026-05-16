import { PublishCommand } from '@aws-sdk/client-sns';
import { NotSupportedError, PubSub } from '@pubber-subber/core';
import { describe, expect, it, vi } from 'vitest';
import { awsSns } from '../src/index.js';

class FakeSnsClient {
  send = vi.fn(async (_cmd: unknown) => ({ MessageId: 'm-1' }));
  destroy = vi.fn();
}

describe('aws-sns adapter (unit)', () => {
  it('forwards publish to SNS PublishCommand', async () => {
    const client = new FakeSnsClient();
    const adapter = awsSns({ client: client as never });
    const pubsub = new PubSub({ adapter });

    await pubsub.publish(
      'arn:aws:sns:us-east-1:000:my-topic',
      { id: 1 },
      {
        messageAttributes: {
          tenantId: { DataType: 'String', StringValue: 't1' },
        },
        subject: 'New User',
      },
    );

    expect(client.send).toHaveBeenCalledTimes(1);
    const cmd = client.send.mock.calls[0]?.[0] as PublishCommand;
    expect(cmd).toBeInstanceOf(PublishCommand);
    expect(cmd.input).toMatchObject({
      Message: JSON.stringify({ id: 1 }),
      TopicArn: 'arn:aws:sns:us-east-1:000:my-topic',
      Subject: 'New User',
    });
  });

  it('uses opts.topicArn when topic is not an ARN', async () => {
    const client = new FakeSnsClient();
    const adapter = awsSns({
      client: client as never,
      topicArn: 'arn:aws:sns:us-east-1:000:default',
    });
    const pubsub = new PubSub({ adapter });
    await pubsub.publish('logical.topic', { x: 1 });
    const cmd = client.send.mock.calls[0]?.[0] as PublishCommand;
    expect(cmd.input.TopicArn).toBe('arn:aws:sns:us-east-1:000:default');
  });

  it('throws NotSupportedError on subscribe', async () => {
    const client = new FakeSnsClient();
    const adapter = awsSns({ client: client as never });
    const pubsub = new PubSub({ adapter });
    await expect(pubsub.subscribe('t', () => {})).rejects.toBeInstanceOf(NotSupportedError);
  });
});
