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

function loadPlayer(host, extra) {
  const listeners = [];
  const win = Object.assign({
    location: { hostname: host },
    addEventListener: (type, fn) => listeners.push(fn),
    dispatch: (data) => listeners.forEach((fn) => fn({ data })),
  }, extra || {});
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

const PLAYER_JSON = JSON.stringify({
  videoDetails: { title: 'video' },
  adPlacements: [{ ad: 1 }],
  playerAds: [{ ad: 2 }],
  streamingData: { formats: ['ok'] },
});

test('XHR responses from the player endpoint are sanitized', () => {
  function FakeXHR() {}
  Object.defineProperty(FakeXHR.prototype, 'responseText', {
    configurable: true,
    get() { return this._text; },
  });
  FakeXHR.prototype.open = function (method, url) { this._url = url; };
  FakeXHR.prototype.send = function () { this._text = PLAYER_JSON; };

  const { win } = loadPlayer('www.youtube.com', { XMLHttpRequest: FakeXHR });
  const player = new win.XMLHttpRequest();
  player.open('GET', 'https://www.youtube.com/youtubei/v1/player?key=x');
  player.send();
  assert.equal(JSON.parse(player.responseText).adPlacements.length, 0);

  const other = new win.XMLHttpRequest();
  other.open('GET', 'https://www.youtube.com/feed/you');
  other.send();
  assert.equal(JSON.parse(other.responseText).adPlacements.length, 1);
});

test('fetch responses from the player endpoint are sanitized and preserve status', async () => {
  function FakeResponse(body, init) {
    this._body = body;
    this.status = init.status;
    this.statusText = init.statusText;
    this.headers = init.headers;
  }
  FakeResponse.prototype.text = function () { return Promise.resolve(this._body); };
  FakeResponse.prototype.clone = function () { return new FakeResponse(this._body, this); };

  const fetchImpl = (url) => {
    const response = new FakeResponse(PLAYER_JSON, { status: 200, statusText: 'OK', headers: {} });
    Object.defineProperty(response, 'url', { value: String(url) });
    return Promise.resolve(response);
  };
  const { win, api } = loadPlayer('www.youtube.com', {
    fetch: fetchImpl,
    Response: FakeResponse,
  });

  const player = await win.fetch('https://www.youtube.com/youtubei/v1/player?key=x');
  assert.equal(player.status, 200);
  assert.equal(JSON.parse(await player.text()).playerAds.length, 0);

  const other = await win.fetch('https://www.youtube.com/feed/you');
  assert.equal(JSON.parse(await other.text()).playerAds.length, 1);

  api.setActive(false);
  const paused = await win.fetch('https://www.youtube.com/youtubei/v1/player?key=x');
  assert.equal(JSON.parse(await paused.text()).playerAds.length, 1);
});

test('uBO/AdGuard endpoints and player script guard are recognized', () => {
  const { api } = loadPlayer('www.youtube.com');
  assert.equal(api.isPlayerEndpoint('https://www.youtube.com/youtubei/v1/get_watch?key=x'), true);
  assert.equal(api.isPlayerEndpoint('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(api.isPlayerEndpoint('https://www.youtube.com/playlist?list=abc'), true);
  assert.equal(api.isPlayerEndpoint('https://www.youtube.com/feed/you'), false);
  assert.equal(api.isPlayerScript('https://www.youtube.com/s/player/abc/base.js?v=1'), true);

  const script = 'if(!U||!U.adPlacements&&!U.adSlots){breaks();}';
  assert.equal(api.sanitizeScriptText(script), 'if(!U||0){breaks();}');
});

test('stitched (SSAP) ads are skipped through the player API', () => {
  let scan = null;
  const seekCalls = [];
  const player = {
    classList: { contains: () => false },
    getStatsForNerds: () => ({ debug_info: 'SSAP, AD, ...' }),
    getProgressState: () => ({ duration: 100 }),
    seekTo: (...args) => seekCalls.push(args),
  };
  const doc = {
    getElementById: (id) => (id === 'movie_player' ? player : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const { api } = loadPlayer('www.youtube.com', {
    document: doc,
    setInterval: (fn) => { scan = fn; return 1; },
  });

  assert.ok(typeof scan === 'function', 'skipper installed');
  scan();
  assert.deepEqual(seekCalls, [[100, true]]);

  api.setActive(false);
  scan();
  assert.equal(seekCalls.length, 1, 'paused switch leaves the page alone');
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
