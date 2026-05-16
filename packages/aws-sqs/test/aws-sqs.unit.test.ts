import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import { NotSupportedError, PubSub } from '@pubber-subber/core';
import { describe, expect, it, vi } from 'vitest';
import { awsSqs } from '../src/index.js';

interface QueuedReply {
  Messages?: Array<Record<string, unknown>>;
}

function fakeClient(replies: QueuedReply[]) {
  const queue = [...replies];
  const send = vi.fn(async (cmd: unknown) => {
    if (cmd instanceof ReceiveMessageCommand) {
      const next = queue.shift();
      if (next) return next;
      // After the queue drains, block briefly so the loop doesn't spin.
      await new Promise((r) => setTimeout(r, 50));
      return { Messages: [] };
    }
    if (cmd instanceof DeleteMessageCommand) return {};
    if (cmd instanceof ChangeMessageVisibilityCommand) return {};
    return {};
  });
  return { send, destroy: vi.fn() };
}

describe('aws-sqs adapter (unit)', () => {
  it('throws NotSupportedError on publish', async () => {
    const client = fakeClient([]);
    const adapter = awsSqs({ client: client as never, queueUrl: 'q' });
    const pubsub = new PubSub({ adapter });
    await expect(pubsub.publish('t', 1)).rejects.toBeInstanceOf(NotSupportedError);
  });

  it('delivers a JSON-encoded message and acks it', async () => {
    const client = fakeClient([
      {
        Messages: [
          {
            MessageId: 'm-1',
            ReceiptHandle: 'r-1',
            Body: JSON.stringify({ id: 42 }),
          },
        ],
      },
    ]);
    const adapter = awsSqs({ client: client as never, queueUrl: 'q' });
    const pubsub = new PubSub({ adapter });

    const received = new Promise<unknown>((resolve) => {
      pubsub.subscribe('orders.created', (msg) => resolve(msg.payload));
    });

    expect(await received).toEqual({ id: 42 });
    // Give the post-handler ack a tick to fire.
    await new Promise((r) => setTimeout(r, 20));

    const deleteCalls = client.send.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
    expect(deleteCalls).toHaveLength(1);
  });

  it('unwraps an SNS notification envelope', async () => {
    const innerPayload = JSON.stringify({ greeting: 'hi' });
    const snsEnvelope = JSON.stringify({
      Type: 'Notification',
      MessageId: 'sns-1',
      Message: innerPayload,
      MessageAttributes: { foo: { Type: 'String', Value: 'bar' } },
    });
    const client = fakeClient([
      { Messages: [{ MessageId: 'm-1', ReceiptHandle: 'r-1', Body: snsEnvelope }] },
    ]);
    const adapter = awsSqs({ client: client as never, queueUrl: 'q' });
    const pubsub = new PubSub({ adapter });

    const received = new Promise<unknown>((resolve) => {
      pubsub.subscribe('t', (msg) => resolve(msg.payload));
    });
    expect(await received).toEqual({ greeting: 'hi' });
  });

  it('nacks (visibility=0) when the handler throws', async () => {
    const client = fakeClient([
      {
        Messages: [{ MessageId: 'm-1', ReceiptHandle: 'r-1', Body: '"hi"' }],
      },
    ]);
    const adapter = awsSqs({ client: client as never, queueUrl: 'q' });
    const pubsub = new PubSub({ adapter, onError: () => {} });
    let attempts = 0;
    const done = new Promise<void>((resolve) => {
      pubsub.subscribe('t', () => {
        attempts += 1;
        resolve();
        throw new Error('boom');
      });
    });
    await done;
    await new Promise((r) => setTimeout(r, 20));

    expect(attempts).toBe(1);
    const nackCalls = client.send.mock.calls.filter(
      (c) => c[0] instanceof ChangeMessageVisibilityCommand,
    );
    expect(nackCalls).toHaveLength(1);
  });

  it('stops the receive loop on unsubscribe', async () => {
    const client = fakeClient([]);
    const adapter = awsSqs({ client: client as never, queueUrl: 'q' });
    const pubsub = new PubSub({ adapter });
    const sub = await pubsub.subscribe('t', () => {});
    await sub.unsubscribe();
    // Give the loop a couple of ticks; after unsubscribe, no new ReceiveMessage calls should fire.
    await new Promise((r) => setTimeout(r, 100));
    const callsBefore = client.send.mock.calls.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(client.send.mock.calls.length).toBe(callsBefore);
  });
});
