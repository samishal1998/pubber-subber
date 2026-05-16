import { SerializationError } from './errors';

export interface Codec {
  readonly name: string;
  encode(value: unknown): string | Uint8Array;
  decode<T = unknown>(data: string | Uint8Array): T;
}

export const jsonCodec = (): Codec => ({
  name: 'json',
  encode(value) {
    try {
      return JSON.stringify(value);
    } catch (err) {
      throw new SerializationError('Failed to JSON.stringify payload', { cause: err });
    }
  },
  decode<T = unknown>(data: string | Uint8Array): T {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new SerializationError('Failed to JSON.parse payload', { cause: err });
    }
  },
});

export const passthroughCodec = (): Codec => ({
  name: 'passthrough',
  encode(value) {
    if (typeof value === 'string' || value instanceof Uint8Array) return value;
    throw new SerializationError('passthroughCodec only accepts string or Uint8Array values');
  },
  decode<T = unknown>(data: string | Uint8Array): T {
    return data as unknown as T;
  },
});
