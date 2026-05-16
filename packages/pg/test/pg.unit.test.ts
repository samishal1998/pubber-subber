import { EventEmitter } from 'node:events';
import { PubSub, PublishError } from '@pubber-subber/core';
import { describe, expect, it, vi } from 'vitest';
import { pg } from '../src/index.js';

class FakeClient extends EventEmitter {
  query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
  connect = vi.fn(async () => {});
  end = vi.fn(async () => {});
}

describe('pg adapter (unit)', () => {
  it('publishes via SELECT pg_notify($1, $2)', async () => {
    const client = new FakeClient();
    const adapter = pg({ client: client as never });
    const pubsub = new PubSub({ adapter });
    await pubsub.publish('users.created', { id: 1 });

    expect(client.query).toHaveBeenCalledWith('SELECT pg_notify($1, $2)', [
      'users.created',
      JSON.stringify({ id: 1 }),
    ]);
  });

  it('hashes channel names longer than 63 bytes', async () => {
    const client = new FakeClient();
    const adapter = pg({ client: client as never });
    const pubsub = new PubSub({ adapter });
    const longTopic = 'a'.repeat(100);
    await pubsub.publish(longTopic, 'payload');
    const call = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('SELECT pg_notify'),
    );
    expect(call?.[1]?.[0]).toMatch(/^pubsub_[a-f0-9]{32}$/);
  });

  it('quotes channel names in LISTEN / UNLISTEN', async () => {
    const client = new FakeClient();
    const adapter = pg({ client: client as never });
    const pubsub = new PubSub({ adapter });

    const sub = await pubsub.subscribe('users.created', () => {});
    const listenCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('LISTEN'),
    );
    expect(listenCall?.[0]).toBe('LISTEN "users.created"');

    await sub.unsubscribe();
    const unlistenCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UNLISTEN'),
    );
    expect(unlistenCall?.[0]).toBe('UNLISTEN "users.created"');
  });

  it('errors on payloads larger than the NOTIFY limit', async () => {
    const client = new FakeClient();
    const adapter = pg({ client: client as never });
    const pubsub = new PubSub({ adapter });
    const huge = 'x'.repeat(8000);
    await expect(pubsub.publish('topic', huge)).rejects.toBeInstanceOf(PublishError);
  });

  it('delivers a notification through the bound handler', async () => {
    const client = new FakeClient();
    const adapter = pg({ client: client as never });
    const pubsub = new PubSub({ adapter });

    const received = new Promise<unknown>((resolve) => {
      pubsub.subscribe('users.created', (msg) => resolve(msg.payload));
    });
    await new Promise((r) => setTimeout(r, 0));

    client.emit('notification', {
      channel: 'users.created',
      payload: JSON.stringify({ id: 42 }),
      processId: 1,
    });

    expect(await received).toEqual({ id: 42 });
  });

  it('only LISTENs once per channel regardless of handler count', async () => {
    const client = new FakeClient();
    const adapter = pg({ client: client as never });
    const pubsub = new PubSub({ adapter });

    await pubsub.subscribe('x', () => {});
    await pubsub.subscribe('x', () => {});

    const listenCalls = client.query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('LISTEN'),
    );
    expect(listenCalls).toHaveLength(1);
  });
});
