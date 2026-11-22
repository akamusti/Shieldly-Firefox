import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const defusers = readFileSync(new URL('../apps/extension/defusers.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../apps/extension/manifest.json', import.meta.url), 'utf8'));
const content = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');

test('local MAIN-world scriptlets are shipped', () => {
  assert.ok(defusers.includes("['admiral', 'noopFunc']"));
  assert.ok(defusers.includes("Object.defineProperty(window, prop"));
  assert.ok(defusers.includes('nativeSetTimeout.apply'));
});

test('manifest injects defusers into the page world at document_start', () => {
  const entry = manifest.content_scripts.find((cs) => (cs.js || []).includes('defusers.js'));
  assert.ok(entry, 'defusers.js content script exists');
  assert.equal(entry.world, 'MAIN');
  assert.equal(entry.run_at, 'document_start');
  assert.equal(entry.all_frames, true);
});

test('isolated script has procedural text rules and inline-script scrubbing', () => {
  assert.ok(content.includes('ANTI_ADBLOCK_PATTERNS'));
  assert.ok(content.includes('function matchesNotice('));
  assert.ok(content.includes('function scrubDetectorScripts()'));
  assert.ok(content.includes('target.remove()'));
});
