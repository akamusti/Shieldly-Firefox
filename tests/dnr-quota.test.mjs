import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const options = readFileSync(new URL('../apps/extension/options.js', import.meta.url), 'utf8');

test('background prioritizes domains before the Firefox rule cap', () => {
  assert.ok(background.includes('MAX_BLOCK_DOMAINS = 10000'));
  assert.ok(background.includes('function prioritizeDomains('));
  assert.ok(background.includes('prioritizeDomains(domains, MAX_BLOCK_DOMAINS)'));
});

test('options page surfaces the quota notice', () => {
  assert.ok(options.includes("getElementById('quotaNotice')"));
});
