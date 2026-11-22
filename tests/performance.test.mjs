import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const defusers = readFileSync(new URL('../apps/extension/defusers.js', import.meta.url), 'utf8');
const content = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');
const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');

test('setTimeout wrapper compiles its detector regex once', () => {
  assert.ok(defusers.includes('const TIMER_TEST = /'));
  assert.ok(!defusers.includes('new RegExp(pattern'));
  assert.ok(defusers.includes('source.length < 8192'));
});

test('defuse observer is bounded and long pages use cheap checks', () => {
  assert.ok(content.includes('defuseObserver.disconnect()'));
  assert.ok(content.includes('Date.now() + 8000'));
  assert.ok(content.includes('pageText.length > 20000'));
  assert.ok(content.includes('getBoundingClientRect()'));
});

test('filter list fetches are cached in memory', () => {
  assert.ok(background.includes('listTextCache'));
  assert.ok(background.includes('LIST_CACHE_MS'));
  assert.ok(background.includes('listTextCache.clear()'));
});
