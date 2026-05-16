import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const pkgSrc = (name: string): string => path.resolve(repoRoot, 'packages', name, 'src/index.ts');

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their source directly so the e2e suite
    // doesn't depend on `pnpm -r build` having run first.
    alias: {
      '@pubber-subber/core/testing': path.resolve(repoRoot, 'packages/core/src/testing/index.ts'),
      '@pubber-subber/core': pkgSrc('core'),
      '@pubber-subber/memory': pkgSrc('memory'),
      '@pubber-subber/redis': pkgSrc('redis'),
      '@pubber-subber/pg': pkgSrc('pg'),
      '@pubber-subber/rxjs': pkgSrc('rxjs'),
    },
  },
  test: {
    // Containers take a while to boot the first time an image is pulled.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One container per file; running them in series keeps Docker resource
    // usage predictable and the failure output readable.
    fileParallelism: false,
    pool: 'forks',
  },
});
