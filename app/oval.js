import { run } from './common.js';

run({
  tone: (s) => `var(--c-${s === 'unknown' ? 'maybe' : s})`,
  onHero() {},
});
