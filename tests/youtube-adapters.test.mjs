import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const playerSource = readFileSync(
  new URL('../apps/extension/site-adapters/youtube.js', import.meta.url), 'utf8');
const defuserSource = readFileSync(
  new URL('../apps/extension/site-adapters/youtube-defuser.js', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../apps/extension/manifest.json', import.meta.url), 'utf8'));

function loadPlayer(host) {
  const listeners = [];
  const win = {
    location: { hostname: host },
    addEventListener: (type, fn) => listeners.push(fn),
    dispatch: (data) => listeners.forEach((fn) => fn({ data })),
  };
  const context = { window: win };
  vm.runInNewContext(playerSource, context);
  return { api: context.ShieldlyYouTube, win };
}

function loadDefuser() {
  let style = null;
  const doc = {
    documentElement: { appendChild() {} },
    head: { appendChild: (node) => { style = node; } },
    getElementById: (id) => (style && style.id === id ? style : null),
    createElement: () => ({ id: '', textContent: '' }),
  };
  const context = {
    window: { location: { hostname: 'www.youtube.com' }, addEventListener() {} },
    document: doc,
  };
  vm.runInNewContext(defuserSource, context);
  return { api: context.ShieldlyYouTubeDefuser, getStyle: () => style };
}

test('player adapter strips ad scheduling fields without mutating the input', () => {
  const { api } = loadPlayer('www.youtube.com');
  const response = {
    videoDetails: { title: 'video' },
    adPlacements: [{ ad: 1 }],
    playerAds: [{ ad: 2 }],
    adBreak: { ad: 3 },
    streamingData: { formats: ['ok'] },
  };
  const clean = api.sanitizePlayerResponse(response);
  assert.equal(clean.adPlacements.length, 0);
  assert.equal(clean.playerAds.length, 0);
  assert.equal('adBreak' in clean, false);
  assert.equal(clean.videoDetails.title, 'video');
  assert.equal(clean.streamingData.formats[0], 'ok');
  assert.equal(response.adPlacements.length, 1, 'input is unchanged');
});

test('player hook sanitizes assignments and follows the per-site toggle', () => {
  const { api, win } = loadPlayer('www.youtube.com');
  assert.equal(api.installPlayerHook(win), false, 'hook is installed on load');

  const response = { adPlacements: [{ ad: 1 }], videoDetails: { title: 'video' } };
  win.ytInitialPlayerResponse = response;
  assert.equal(win.ytInitialPlayerResponse.adPlacements.length, 0);

  win.dispatch({ source: 'shieldly', type: 'youtube-toggle', enabled: false });
  assert.equal(api.active, false);
  win.ytInitialPlayerResponse = response;
  assert.equal(win.ytInitialPlayerResponse.adPlacements.length, 1);

  win.dispatch({ source: 'shieldly', type: 'youtube-toggle', enabled: true });
  win.ytInitialPlayerResponse = response;
  assert.equal(win.ytInitialPlayerResponse.adPlacements.length, 0);
});

test('player adapter only runs on YouTube hosts', () => {
  const { api } = loadPlayer('example.com');
  assert.equal(api.isYouTubeHost('youtube.com'), true);
  assert.equal(api.isYouTubeHost('m.youtube.com'), true);
  assert.equal(api.isYouTubeHost('youtu.be'), true);
  assert.equal(api.isYouTubeHost('youtube.com.evil.test'), false);
});

test('defuser removes only ad-block enforcement screens', () => {
  const { api } = loadDefuser();
  const blocked = {
    playabilityStatus: {
      status: 'ERROR',
      errorScreen: { playerErrorMessageRenderer: { reasonText: { runs: [{ text: 'Ad blockers violate the Terms' }] } } },
    },
  };
  const clean = api.sanitizeEnforcementResponse(blocked);
  assert.equal(clean.playabilityStatus.status, 'OK');
  assert.equal('errorScreen' in clean.playabilityStatus, false);

  const genuine = {
    playabilityStatus: {
      status: 'ERROR',
      errorScreen: { playerErrorMessageRenderer: { reasonText: { runs: [{ text: 'Video unavailable' }] } } },
    },
  };
  assert.ok('errorScreen' in api.sanitizeEnforcementResponse(genuine).playabilityStatus);
  assert.equal(api.isEnforcementText('reklam engelleyici algılandı'), true);
});

test('defuser injects local CSS and can be paused', () => {
  const { api, getStyle } = loadDefuser();
  assert.ok(getStyle(), 'style element injected');
  assert.ok(getStyle().textContent.includes('ytd-enforcement-message-view-model'));
  api.setDefuserActive(false);
  assert.equal(api.active, false);
  api.setDefuserActive(true);
  assert.equal(api.active, true);
});

test('manifest registers both YouTube scriptlets in the MAIN world', () => {
  const entry = manifest.content_scripts.find((c) =>
    c.js && c.js.includes('site-adapters/youtube.js'));
  assert.ok(entry, 'player adapter is registered');
  assert.ok(entry.js.includes('site-adapters/youtube-defuser.js'), 'defuser is registered');
  assert.equal(entry.world, 'MAIN');
  assert.equal(entry.run_at, 'document_start');
  assert.ok(entry.matches.includes('https://www.youtube.com/*'));
  assert.ok(manifest.host_permissions.includes('<all_urls>'));
});
