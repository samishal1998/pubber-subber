import { EventEmitter } from 'node:events';
import { PubSub } from '@pubber-subber/core';
import { describe, expect, it, vi } from 'vitest';
import { gcpPubSub } from '../src/index.js';

class FakeMessage extends EventEmitter {
  constructor(
    public data: Buffer,
    public attributes: Record<string, string> = {},
    public id = 'msg-1',
    public publishTime = new Date(),
    public orderingKey: string | undefined = undefined,
  ) {
    super();
  }
  ack = vi.fn();
  nack = vi.fn();
}

class FakeSubscription extends EventEmitter {
  close = vi.fn(async () => {});
  delete = vi.fn(async () => {});
  exists = vi.fn(async () => [true]);
}

class FakeTopic {
  publishMessage = vi.fn(async () => 'msg-id');
  createSubscription = vi.fn(async () => [new FakeSubscription()]);
}

class FakeClient {
  topics = new Map<string, FakeTopic>();
  subscriptions = new Map<string, FakeSubscription>();
  close = vi.fn(async () => {});
  topic(name: string): FakeTopic {
    let t = this.topics.get(name);
    if (!t) {
      t = new FakeTopic();
      this.topics.set(name, t);
    }
    return t;
  }
  subscription(name: string): FakeSubscription {
    let s = this.subscriptions.get(name);
    if (!s) {
      s = new FakeSubscription();
      this.subscriptions.set(name, s);
    }
    return s;
  }
}

describe('gcp-pubsub adapter (unit)', () => {
  it('publishes via topic.publishMessage with data buffer + attributes + orderingKey', async () => {
    const client = new FakeClient();
    const adapter = gcpPubSub({ client: client as never });
    const pubsub = new PubSub({ adapter });

    await pubsub.publish(
      'users.created',
      { id: 1 },
      {
        attributes: { tenantId: 't1' },
        orderingKey: 'user-1',
      },
    );

    const topic = client.topics.get('users.created');
    if (!topic) throw new Error('expected topic to be registered');
    expect(topic.publishMessage).toHaveBeenCalledTimes(1);
    const call = topic.publishMessage.mock.calls[0]?.[0] as {
      data: Buffer;
      attributes?: Record<string, string>;
      orderingKey?: string;
    };
    expect(call.attributes).toEqual({ tenantId: 't1' });
    expect(call.orderingKey).toBe('user-1');
    expect(JSON.parse(call.data.toString('utf8'))).toEqual({ id: 1 });
  });

  it('auto-acks the message on handler success', async () => {
    const client = new FakeClient();
    const adapter = gcpPubSub({ client: client as never });
    const pubsub = new PubSub({ adapter });

    const subscription = client.subscription('s');
    await pubsub.subscribe('users.created', () => {}, { subscriptionName: 's' });

    const message = new FakeMessage(Buffer.from(JSON.stringify({ id: 1 })));
    subscription.emit('message', message);

    await new Promise((r) => setTimeout(r, 0));
    expect(message.ack).toHaveBeenCalled();
    expect(message.nack).not.toHaveBeenCalled();
  });

  it('auto-nacks the message on handler failure', async () => {
    const client = new FakeClient();
    const adapter = gcpPubSub({ client: client as never });
    const pubsub = new PubSub({ adapter, onError: () => {} });

    const subscription = client.subscription('s');
    await pubsub.subscribe(
      'users.created',
      () => {
        throw new Error('boom');
      },
      { subscriptionName: 's' },
    );

    const message = new FakeMessage(Buffer.from(JSON.stringify({ id: 1 })));
    subscription.emit('message', message);

    await new Promise((r) => setTimeout(r, 0));
    expect(message.nack).toHaveBeenCalled();
  });

  it('decodes JSON payloads by default', async () => {
    const client = new FakeClient();
    const adapter = gcpPubSub({ client: client as never });
    const pubsub = new PubSub({ adapter });

    const subscription = client.subscription('s');
    const received = new Promise<unknown>((resolve) => {
      pubsub.subscribe('t', (msg) => resolve(msg.payload), { subscriptionName: 's' });
    });
    await new Promise((r) => setTimeout(r, 0));

    subscription.emit('message', new FakeMessage(Buffer.from(JSON.stringify({ x: 42 }))));

    expect(await received).toEqual({ x: 42 });
  });

  it('deletes the subscription on unsubscribe when ephemeral=true', async () => {
    const client = new FakeClient();
    const adapter = gcpPubSub({ client: client as never });
    const pubsub = new PubSub({ adapter });

    const sub = await pubsub.subscribe('t', () => {}, {
      subscriptionName: 's',
      ephemeral: true,
    });
    const subscription = client.subscription('s');
    await sub.unsubscribe();
    expect(subscription.delete).toHaveBeenCalled();
  });
});
