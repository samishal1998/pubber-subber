import { runConformance } from '@pubber-subber/core/testing';
import { memory } from '../src/index.js';

runConformance({
  name: 'memory',
  createAdapter: () => memory(),
});
