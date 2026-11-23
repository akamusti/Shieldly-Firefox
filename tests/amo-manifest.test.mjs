import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../apps/extension/manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('manifest declares AMO-required metadata', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.browser_specific_settings.gecko.id, 'shieldly@privacy-shield');
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions.required,
    ['none'],
  );
  assert.equal(manifest.browser_specific_settings.gecko_android.strict_min_version, '142.0');
});

test('host access lives only in host_permissions', () => {
  assert.ok(!manifest.permissions.includes('<all_urls>'));
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.equal(manifest.version, pkg.version);
});
