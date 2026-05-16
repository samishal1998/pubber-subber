import type { AdapterMessage, PubSub, SubscriptionHandle } from '@pubber-subber/core';
import { Observable } from 'rxjs';

/**
 * Bridge a topic to an RxJS Observable that emits the full `AdapterMessage`.
 *
 * The subscription is created lazily when the first RxJS subscriber attaches,
 * and torn down on unsubscribe. Handles the case where teardown races the
 * underlying `pubsub.subscribe` resolution.
 */
export function toObservable<T = unknown>(
  pubsub: PubSub,
  topic: string,
  meta?: unknown,
): Observable<AdapterMessage<T>> {
  return new Observable<AdapterMessage<T>>((subscriber) => {
    let handle: SubscriptionHandle | null = null;
    let cancelled = false;

    pubsub
      .subscribe<T>(
        topic,
        (msg) => {
          subscriber.next(msg);
        },
        meta as never,
      )
      .then((h) => {
        if (cancelled) {
          void h.unsubscribe();
        } else {
          handle = h;
        }
      })
      .catch((err) => {
        if (!cancelled) subscriber.error(err);
      });

    return () => {
      cancelled = true;
      if (handle) {
        void handle.unsubscribe();
        handle = null;
      }
    };
  });
}

/**
 * Same as `toObservable` but emits the unwrapped payload instead of the full
 * `AdapterMessage`. The convenience choice for app code that doesn't care
 * about topic / ack / raw envelope.
 */
export function fromTopic<T = unknown>(
  pubsub: PubSub,
  topic: string,
  meta?: unknown,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    let handle: SubscriptionHandle | null = null;
    let cancelled = false;

    pubsub
      .subscribe<T>(
        topic,
        (msg) => {
          subscriber.next(msg.payload);
        },
        meta as never,
      )
      .then((h) => {
        if (cancelled) {
          void h.unsubscribe();
        } else {
          handle = h;
        }
      })
      .catch((err) => {
        if (!cancelled) subscriber.error(err);
      });

    return () => {
      cancelled = true;
      if (handle) {
        void handle.unsubscribe();
        handle = null;
      }
    };
  });
}
