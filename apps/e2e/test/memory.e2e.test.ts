import { runConformance } from '@pubber-subber/core/testing';
import { memory } from '@pubber-subber/memory';
import { runRxjsSuite } from '../src/rxjs-suite.js';

runConformance({
  name: 'memory (e2e)',
  createAdapter: () => memory(),
});

runRxjsSuite({
  name: 'memory',
  createAdapter: () => memory(),
});
