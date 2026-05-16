import { createHash } from 'node:crypto';
import {
  type AdapterMessage,
  type Codec,
  type MessageHandler,
  type PubSubAdapter,
  PublishError,
  jsonCodec,
} from '@pubber-subber/core';
import { Client, type ClientConfig } from 'pg';

export interface PgAdapterOptions {
  /** Postgres connection string, e.g. `postgres://user:pass@host:5432/db`. */
  connectionString?: string;
  /** Or a full `pg.ClientConfig`. */
  config?: ClientConfig;
  /**
   * Bring-your-own `pg.Client`. The adapter will not call `connect`/`end` on it.
   * Useful when you want to control the dedicated LISTEN client lifecycle yourself.
   */
  client?: Client;
  /** Payload codec. Default: JSON. */
  codec?: Codec;
}

export interface PgPublishMeta {
  /** Override the wire channel name. The `AdapterMessage.topic` keeps the original. */
  channel?: string;
}

export interface PgSubscribeMeta {
  /** Override the wire channel name. */
  channel?: string;
}

/** Postgres identifier max length (bytes). */
const MAX_CHANNEL_BYTES = 63;
/**
 * NOTIFY total payload limit is 8000 bytes; we leave headroom for the channel
 * name and protocol envelope.
 */
const MAX_PAYLOAD_BYTES = 7500;

interface HandlerEntry {
  topic: string;
  handler: MessageHandler;
}

export function pg(opts: PgAdapterOptions = {}): PubSubAdapter<PgPublishMeta, PgSubscribeMeta> {
  const codec = opts.codec ?? jsonCodec();
  let client: Client | null = null;
  let owned = true;
  let installed = false;
  let idCounter = 0;

  const byChannel = new Map<string, Set<HandlerEntry>>();

  const ensure = async (): Promise<Client> => {
    if (client) return client;
    if (opts.client) {
      client = opts.client;
      owned = false;
    } else {
      client = opts.connectionString
        ? new Client({ connectionString: opts.connectionString, ...opts.config })
        : new Client(opts.config);
      owned = true;
      await client.connect();
    }
    if (!installed) {
      installed = true;
      client.on('notification', (notif) => {
        const channel = notif.channel;
        const entries = byChannel.get(channel);
        if (!entries) return;
        let payload: unknown = notif.payload;
        if (typeof notif.payload === 'string') {
          try {
            payload = codec.decode(notif.payload);
          } catch {
            // leave as raw string
          }
        }
        for (const { topic, handler } of [...entries]) {
          const msg: AdapterMessage = {
            topic,
            payload,
            raw: notif,
          };
          Promise.resolve(handler(msg)).catch(noop);
        }
      });
    }
    return client;
  };

  return {
    name: 'pg',
    capabilities: { publish: true, subscribe: true, patternSubscribe: false, ack: false },

    async connect() {
      await ensure();
    },

    async disconnect() {
      const c = client;
      client = null;
      installed = false;
      byChannel.clear();
      if (!owned || !c) return;
      await c.end().catch(noop);
    },

    async publish(topic, payload, meta) {
      const c = await ensure();
      const channel = deriveChannel(meta?.channel ?? topic);
      const encoded = codec.encode(payload);
      const wire = typeof encoded === 'string' ? encoded : Buffer.from(encoded).toString('utf8');
      const byteLength = Buffer.byteLength(wire, 'utf8');
      if (byteLength > MAX_PAYLOAD_BYTES) {
        throw new PublishError(
          `Encoded payload is ${byteLength} bytes; Postgres NOTIFY limit is ~${MAX_PAYLOAD_BYTES} bytes. Publish a reference (e.g. row id) instead and resolve the body via SELECT in the subscriber.`,
        );
      }
      await c.query('SELECT pg_notify($1, $2)', [channel, wire]);
    },

    async subscribe(topic, handler, meta) {
      const c = await ensure();
      const channel = deriveChannel(meta?.channel ?? topic);
      let set = byChannel.get(channel);
      const firstSub = !set;
      if (!set) {
        set = new Set();
        byChannel.set(channel, set);
      }
      const entry: HandlerEntry = { topic, handler };
      set.add(entry);
      if (firstSub) {
        await c.query(`LISTEN ${quoteIdentifier(channel)}`);
      }
      idCounter += 1;
      const id = `pg-${idCounter}`;
      const ownSet = set;
      return {
        id,
        topic,
        unsubscribe: async () => {
          ownSet.delete(entry);
          if (ownSet.size === 0) {
            byChannel.delete(channel);
            if (client) {
              await client.query(`UNLISTEN ${quoteIdentifier(channel)}`).catch(noop);
            }
          }
        },
      };
    },
  };
}

function deriveChannel(topic: string): string {
  if (Buffer.byteLength(topic, 'utf8') <= MAX_CHANNEL_BYTES) {
    return topic;
  }
  const hash = createHash('sha256').update(topic).digest('hex').slice(0, 32);
  return `pubsub_${hash}`;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function noop(): void {
  // intentional
}
