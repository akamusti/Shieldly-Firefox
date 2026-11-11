import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const parserStart = source.indexOf('// --- filter list parsing');
const parserMarker = '// --- end filter list parsing';
const parserEnd = source.indexOf(parserMarker, parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart, 'filter parser section exists');

const context = { URL };
const stripStart = source.indexOf('function stripTrackingParams(');
const stripEnd = source.indexOf('\nfunction isThirdParty(', stripStart);
assert.ok(stripStart >= 0 && stripEnd > stripStart, 'tracking parameter rewriter exists');
vm.runInNewContext(
  `${source.slice(parserStart, parserEnd + parserMarker.length)}
let globalRemoveParams = new Set();
let scopedRemoveParams = new Map();
let regexRemoveParams = [];
${source.slice(stripStart, stripEnd)}
globalThis.hooks = {
  parseFilterList,
  setRules(global, scoped, regex = []) {
    globalRemoveParams = new Set(global);
    scopedRemoveParams = new Map(scoped);
    regexRemoveParams = regex.map((pattern) => new RegExp(pattern.slice(1, -1)));
  },
  stripTrackingParams,
};`,
  context,
);

test('parses generic, site-specific, and exception cosmetic rules', () => {
  const parsed = context.hooks.parseFilterList([
    '##.ad-banner',
    'news.example##.sponsored',
    'news.example#@#.keep',
    '# ordinary comment',
  ].join('\n'));

  assert.deepEqual(Array.from(parsed.cosmeticGeneric), ['##.ad-banner']);
  assert.deepEqual(Array.from(parsed.cosmeticSelectors), ['news.example##.sponsored']);
  assert.deepEqual(Array.from(parsed.cosmeticExceptions), ['news.example##.keep']);
});

test('parses hosts-file entries and anchored network domains', () => {
  const parsed = context.hooks.parseFilterList([
    '0.0.0.0 ads.example tracker.example # list comment',
    '||blocked.example^',
    '||not-a-host.example^$script',
  ].join('\n'));

  assert.deepEqual(
    Array.from(parsed.domains).sort(),
    ['ads.example', 'blocked.example', 'tracker.example'],
  );
});

test('applies global and parent-domain removeparam rules but preserves auth parameters', () => {
  context.hooks.setRules(
    ['utm_source'],
    [['shop.example', new Set(['campaign_id'])]],
  );
  const rewritten = context.hooks.stripTrackingParams(
    'https://store.shop.example/item?utm_source=a&utm_source=b&campaign_id=7&state=login#details',
    'store.shop.example',
  );

  const result = new URL(rewritten);
  assert.equal(result.searchParams.has('utm_source'), false);
  assert.equal(result.searchParams.has('campaign_id'), false);
  assert.equal(result.searchParams.get('state'), 'login');
  assert.equal(result.hash, '#details');
});

test('validates and applies removeparam regular expressions', () => {
  const parsed = context.hooks.parseFilterList([
    '*$removeparam=/^utm_/',
    '*$removeparam=/[/',
  ].join('\n'));

  assert.deepEqual(Array.from(parsed.regexRemoveParams), ['/^utm_/']);
  assert.equal(parsed.unsupported, 1);
  context.hooks.setRules([], [], Array.from(parsed.regexRemoveParams));
  const rewritten = context.hooks.stripTrackingParams(
    'https://shop.example/item?utm_campaign=spring&ref=home',
    'shop.example',
  );
  assert.equal(new URL(rewritten).searchParams.has('utm_campaign'), false);
  assert.equal(new URL(rewritten).searchParams.get('ref'), 'home');
});

test('rejects removeparam rules whose URL pattern cannot be represented safely', () => {
  const parsed = context.hooks.parseFilterList([
    '||shop.example/path$removeparam=campaign_id',
    '||shop.example^$removeparam=/^utm_/',
    'https://shop.example/*$removeparam=campaign_id',
  ].join('\n'));

  assert.equal(parsed.removeParams.size, 0);
  assert.equal(parsed.scopedRemoveParams.size, 0);
  assert.equal(parsed.regexRemoveParams.length, 0);
  assert.equal(parsed.unsupported, 3);
});

test('accepts generic removeparam rules without a URL pattern', () => {
  const parsed = context.hooks.parseFilterList('$removeparam=campaign');
  assert.deepEqual(Array.from(parsed.removeParams), ['campaign']);
  assert.equal(parsed.unsupported, 0);
});
