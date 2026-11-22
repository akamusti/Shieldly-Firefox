import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const content = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');

test('background blocks anti-adblock detection scripts', () => {
  const match = background.match(/\/blockadblock\|anti-adblock\|anti_adblock\|adblock-detector\/i/);
  assert.ok(match, 'webRequest anti-adblock script pattern exists');
  const pattern = /blockadblock|anti-adblock|anti_adblock|adblock-detector/i;
  assert.ok(pattern.test('https://site.test/blockadblock.min.js'));
  assert.ok(pattern.test('https://site.test/anti-adblock.js'));
  assert.ok(!pattern.test('https://site.test/app.js'));
});

test('content script hides anti-adblock overlays', () => {
  const match = content.match(/const ANTI_ADBLOCK_SELECTORS = \[([\s\S]*?)\];/);
  assert.ok(match, 'anti-adblock selector list exists');
  assert.ok(match[1].includes('#adblock-warning'));
  assert.ok(match[1].includes('.adblock-notice'));
});
