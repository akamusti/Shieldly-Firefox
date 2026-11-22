import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const defusers = readFileSync(new URL('../apps/extension/defusers.js', import.meta.url), 'utf8');
const content = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');
const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');

test('MAIN-world scriptlets are one-shot with no timer wrapper', () => {
  assert.ok(!defusers.includes('window.setTimeout ='));
  assert.ok(!defusers.includes('TIMER_TEST'));
  assert.ok(defusers.includes('Object.defineProperty(owner, prop'));
});

test('defusing is scheduled, not observed on every DOM mutation', () => {
  assert.ok(!content.includes('new MutationObserver('));
  assert.ok(content.includes('NOTICE_CANDIDATES'));
  assert.ok(content.includes('setTimeout(() => defuseTextNotices(), 900)'));
  assert.ok(content.includes('scrubsDone >= 2'));
});

test('filter list fetches are cached in memory', () => {
  assert.ok(background.includes('listTextCache'));
  assert.ok(background.includes('LIST_CACHE_MS'));
  assert.ok(background.includes('listTextCache.clear()'));
});
