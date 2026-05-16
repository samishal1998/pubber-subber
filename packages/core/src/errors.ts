export class PubSubError extends Error {
  override readonly name: string = 'PubSubError';
}

export class NotSupportedError extends PubSubError {
  override readonly name = 'NotSupportedError';
}

export class ConnectionError extends PubSubError {
  override readonly name = 'ConnectionError';
}

export class SerializationError extends PubSubError {
  override readonly name = 'SerializationError';
}

export class SubscriptionError extends PubSubError {
  override readonly name = 'SubscriptionError';
}

export class PublishError extends PubSubError {
  override readonly name = 'PublishError';
}
