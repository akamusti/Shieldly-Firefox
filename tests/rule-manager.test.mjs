import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../apps/extension/options.html', import.meta.url), 'utf8');
const options = readFileSync(new URL('../apps/extension/options.js', import.meta.url), 'utf8');

test('advanced page has My Filters, My Rules and Whitelist panels', () => {
  for (const id of ['dashTabs', 'my-filters', 'my-rules', 'whitelist-panel', 'ruleSummary', 'myRules']) {
    assert.ok(html.includes(`id="${id}"`) || html.includes(`"${id}"`), `missing ${id}`);
  }
});

test('per-rule summary and dynamic rule list are rendered', () => {
  assert.ok(options.includes('function renderRuleSummary('));
  assert.ok(options.includes('function renderMyRules('));
  assert.ok(options.includes("querySelectorAll('#dashTabs button')"));
});
