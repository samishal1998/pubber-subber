import { PubSub } from '@pubber-subber/core';
import { memory } from '@pubber-subber/memory';
import { fromTopic } from '@pubber-subber/rxjs';
import { bufferTime, filter, map } from 'rxjs';

interface PageView {
  user: string;
  path: string;
  ts: number;
}

async function main(): Promise<void> {
  const pubsub = new PubSub({ adapter: memory() });

  // Window page views into 250ms buckets, then summarize.
  const subscription = fromTopic<PageView>(pubsub, 'analytics.pageview')
    .pipe(
      filter((v) => !v.path.startsWith('/internal')),
      bufferTime(250),
      filter((batch) => batch.length > 0),
      map((batch) => ({
        windowEnded: new Date().toISOString(),
        count: batch.length,
        users: new Set(batch.map((v) => v.user)).size,
        paths: [...new Set(batch.map((v) => v.path))],
      })),
    )
    .subscribe((summary) => {
      console.log('summary:', summary);
    });

  // Simulate a burst of page views.
  const start = Date.now();
  for (let i = 0; i < 12; i += 1) {
    await pubsub.publish('analytics.pageview', {
      user: `u${i % 4}`,
      path: i % 5 === 0 ? '/internal/admin' : `/blog/${i}`,
      ts: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 60));
  }

  // Let the last bucket flush.
  await new Promise((r) => setTimeout(r, 350));
  subscription.unsubscribe();
  await pubsub.disconnect();
  console.log(`done in ${Date.now() - start}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
