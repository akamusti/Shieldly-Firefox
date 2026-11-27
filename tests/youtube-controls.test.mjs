import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const background = readFileSync(new URL('../apps/extension/background.js', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../apps/extension/popup.html', import.meta.url), 'utf8');
const popupJs = readFileSync(new URL('../apps/extension/popup.js', import.meta.url), 'utf8');

function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.ok(end > start, `${name} is closed`);
  return source.slice(start, end);
}

function makeGuard(siteSettings, disabledSites = []) {
  const context = { siteSettings, disabledSites };
  vm.runInNewContext(
    `${fn(background, 'isYouTubeHost')}\n${fn(background, 'isSiteDisabled')}\nglobalThis.guard = isSiteDisabled;`,
    context,
  );
  return context.guard;
}

function makeHostCheck() {
  const context = {};
  vm.runInNewContext(`${fn(background, 'isYouTubeHost')}\nglobalThis.check = isYouTubeHost;`, context);
  return context.check;
}

test('YouTube host detection covers YouTube domains only', () => {
  const check = makeHostCheck();
  assert.equal(check('youtube.com'), true);
  assert.equal(check('www.youtube.com'), true);
  assert.equal(check('music.YOUTUBE.com.'), true);
  assert.equal(check('youtu.be'), true);
  assert.equal(check('youtube.com.evil.test'), false);
  assert.equal(check('example.com'), false);
});

test('the YouTube switch is per-site and only affects YouTube', () => {
  const settings = { 'www.youtube.com': { youtubeAdBlocking: false } };
  const guard = makeGuard(settings);
  assert.equal(guard('www.youtube.com'), true);
  assert.equal(guard('youtube.com'), false);
  assert.equal(guard('example.com'), false);

  settings['www.youtube.com'].youtubeAdBlocking = true;
  assert.equal(guard('www.youtube.com'), false);
  settings['www.youtube.com'].enabled = false;
  assert.equal(guard('www.youtube.com'), true);
});

test('popup exposes the YouTube switch and a per-site hidden counter', () => {
  assert.ok(popupHtml.includes('id="siteYouTube"'));
  assert.ok(popupHtml.includes('id="pageHidden"'));
  assert.ok(popupJs.includes("toggleModule('youtubeAdBlocking', true)"));
  assert.ok(popupJs.includes('siteHiddenStats'));
  assert.ok(popupJs.includes('isYouTubeHost(host)'));
});
