export interface AdapterMessage<TPayload = unknown> {
  readonly topic: string;
  readonly payload: TPayload;
  readonly raw?: unknown;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly ack?: () => Promise<void>;
  readonly nack?: (err?: unknown) => Promise<void>;
}

export type MessageHandler<TPayload = unknown, TMeta = unknown> = (
  message: AdapterMessage<TPayload>,
  meta?: TMeta,
) => void | Promise<void>;

export interface SubscriptionHandle {
  readonly id: string;
  readonly topic: string;
  readonly unsubscribe: () => Promise<void>;
}

export interface AdapterCapabilities {
  readonly publish: boolean;
  readonly subscribe: boolean;
  readonly patternSubscribe: boolean;
  readonly ack: boolean;
}
