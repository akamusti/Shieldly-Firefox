import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const options = readFileSync(new URL('../apps/extension/options.js', import.meta.url), 'utf8');

function constArray(source, name) {
  const match = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`).exec(source);
  assert.ok(match, `${name} exists`);
  return vm.runInNewContext(`${match[1]};`);
}

test('background and options ship the same opt-in uBO YouTube source', () => {
  const inBackground = constArray(background, 'BUILTIN_LISTS');
  const inOptions = constArray(options, 'BUILTIN_LISTS');
  const ubo = inBackground.find((list) => list.id === 'ubo-filters');
  assert.ok(ubo, 'background has ubo-filters');
  assert.equal(ubo.url, 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt');
  assert.ok(inOptions.some((list) => list.id === 'ubo-filters'), 'options has ubo-filters');
});

test('the uBO source is opt-in in background and options', () => {
  const match = /const defaultEnabled = (\[[^\n]*\]);/.exec(background);
  assert.ok(match, 'background has a defaultEnabled list');
  assert.ok(!vm.runInNewContext(`${match[1]};`).includes('ubo-filters'));
  assert.ok(constArray(options, 'OPTIONAL_LIST_IDS').includes('ubo-filters'));
  assert.ok(!constArray(options, 'BASE_LIST_IDS').includes('ubo-filters'));
});
