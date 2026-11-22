import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');

test('picker supports site-specific and global rules', () => {
  assert.ok(source.includes('function ruleFor(selector, global)'));
  assert.ok(source.includes("return global ? `##${selector}`"));
  assert.ok(source.includes('const global = e.shiftKey === true;'));
  assert.ok(source.includes("showToast(global ? 'Element blocked on all sites'"));
});
