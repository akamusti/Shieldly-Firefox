import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const start = source.indexOf('// --- dynamic filtering');
const marker = '// --- end dynamic filtering';
const end = source.indexOf(marker, start);
assert.ok(start >= 0 && end > start, 'dynamic filtering section exists');

const context = {};
vm.runInNewContext(
  `${source.slice(start, end + marker.length)}
globalThis.setRules = (rules) => { dynamicRules = rules; };
globalThis.resolve = resolveDynamicAction;`,
  context,
);

test('resolves dynamic rules by hostname, target and type precedence', () => {
  context.setRules([
    { hostname: 'example.com', target: '*', type: '*', action: 'block' },
    { hostname: 'example.com', target: 'ads.test', type: 'script', action: 'allow' },
    { hostname: 'sub.example.com', target: 'ads.test', type: '*', action: 'block' },
  ]);
  assert.equal(context.resolve('www.example.com', 'ads.test', 'image'), 'block');
  assert.equal(context.resolve('example.com', 'ads.test', 'script'), 'allow');
  assert.equal(context.resolve('sub.example.com', 'ads.test', 'script'), 'block');
  assert.equal(context.resolve('other.test', 'ads.test', 'script'), null);
});

test('noop wins for its cell and stops lower precedence rules', () => {
  context.setRules([
    { hostname: 'example.com', target: '*', type: '*', action: 'block' },
    { hostname: 'example.com', target: 'ads.test', type: 'script', action: 'noop' },
  ]);
  assert.equal(context.resolve('example.com', 'ads.test', 'script'), 'noop');
  assert.equal(context.resolve('example.com', 'ads.test', 'image'), 'block');
});
