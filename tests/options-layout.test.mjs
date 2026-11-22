import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../apps/extension/options.html', import.meta.url), 'utf8');
const options = readFileSync(new URL('../apps/extension/options.js', import.meta.url), 'utf8');

test('options uses compact tabbed panes', () => {
  assert.ok(html.includes('class="tabs"'));
  assert.equal((html.match(/class="pane/g) || []).length, 5);
  assert.ok(/class="[^"]*scroll/.test(html));
  assert.ok(html.includes('<details>'));
});

test('tab switching keeps the popup deep link', () => {
  assert.ok(options.includes('function activatePane('));
  assert.ok(options.includes("'request-log': 'log'"));
  assert.ok(!options.includes('scrollIntoView'));
});
