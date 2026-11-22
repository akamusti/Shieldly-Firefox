import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../apps/extension/options.html', import.meta.url), 'utf8');
const options = readFileSync(new URL('../apps/extension/options.js', import.meta.url), 'utf8');

test('options page offers export and import controls', () => {
  assert.ok(html.includes('id="exportSettings"'));
  assert.ok(html.includes('id="importSettingsFile"'));
  assert.ok(html.includes('id="importSettings"'));
});

test('import validates the backup format and only restores known keys', () => {
  assert.ok(options.includes("parsed.format !== 'privacy-shield-settings'"));
  assert.ok(options.includes('BACKUP_KEYS'));
  assert.ok(options.includes('URL.createObjectURL'));
});
