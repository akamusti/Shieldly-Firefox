import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const options = readFileSync(new URL('../apps/extension/options.js', import.meta.url), 'utf8');

test('background logs the reason and matched rule', () => {
  assert.match(background, /reason: info\.reason \|\| 'block'/);
  assert.match(background, /rule: typeof info\.rule === 'string'/);
  assert.match(background, /reason: 'anti-adblock'/);
  assert.match(background, /reason: 'strict'/);
});

test('options page renders and filters enriched entries', () => {
  assert.ok(options.includes('entry.rule ?'));
  assert.ok(options.includes("getElementById('logFilter')"));
});
