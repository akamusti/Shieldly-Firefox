/*
 * Shieldly — YouTube player adapter (YTROADMAP Faz 2).
 *
 * MAIN world, document_start, YouTube hosts only. Mirrors the inert field
 * list in @privacy-shield/shared; no executable scriptlet lives in core.
 * This layer removes ad scheduling data from ytInitialPlayerResponse before
 * the player reads it. It is best-effort: YouTube changes this shape often.
 *
 * The isolated content script posts { source: 'shieldly',
 * type: 'youtube-toggle', enabled } so the per-site switch can pause it.
 */
(function (root) {
  'use strict';

  // Mirrored from @privacy-shield/shared (YOUTUBE_AD_PLAYER_FIELDS).
  var AD_FIELDS = [
    'adPlacements', 'playerAds', 'adSlots', 'adBreak', 'adBreaks',
    'instreamAdBreak', 'instreamAds',
  ];
  var EMPTY_ARRAYS = ['adPlacements', 'playerAds', 'adSlots'];

  function isYouTubeHost(host) {
    var value = String(host || '').trim().toLowerCase().replace(/\.$/, '');
    return value === 'youtube.com' || value.endsWith('.youtube.com') || value === 'youtu.be';
  }

  function prune(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) prune(value[i]);
      return;
    }
    for (var f = 0; f < AD_FIELDS.length; f += 1) {
      var field = AD_FIELDS[f];
      if (!(field in value)) continue;
      if (EMPTY_ARRAYS.indexOf(field) !== -1 && Array.isArray(value[field])) value[field] = [];
      else delete value[field];
    }
    // Some clients nest a second playerResponse inside the outer response.
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) prune(value[key]);
    }
  }

  /** Returns a copy with ad scheduling fields removed. Never mutates input. */
  function sanitizePlayerResponse(response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
    var copy;
    try {
      copy = JSON.parse(JSON.stringify(response));
    } catch (e) {
      return response;
    }
    prune(copy);
    return copy;
  }

  // Modern YouTube fetches a fresh player response after page load, so
  // cleaning only the global property is not enough. Intercept just the two
  // endpoints that carry player JSON (same idea as uBO's json-prune-xhr).
  var XHR_URLS = typeof WeakMap === 'function' ? new WeakMap() : null;

  // uBO/AdGuard target all of these: the watch/playlist page XHRs also carry
  // an embedded player response, not only the youtubei player endpoint.
  function isPlayerEndpoint(url) {
    var value = String(url || '');
    if (!/(^|\.)youtube\.com/i.test(value) && value.indexOf('/youtubei/') !== 0 && value.indexOf('/watch') !== 0) {
      return false;
    }
    return /\/youtubei\/v\d+\/(player|get_watch|resolve_url|reel_watch_sequence)(?:[?/#]|$)/i.test(value) ||
      /\/watch(?:[?/#]|$)/i.test(value) ||
      /\/playlist(?:[?/#]|$)/i.test(value);
  }

  function sanitizeTextForUrl(text, url) {
    return isPlayerEndpoint(url) ? sanitizeJsonText(text) : text;
  }

  function sanitizeJsonText(text) {
    if (!active || typeof text !== 'string') return text;
    try {
      var parsed = JSON.parse(text);
      var clean = JSON.stringify(sanitizePlayerResponse(parsed));
      return clean === text ? text : clean;
    } catch (e) {
      return text;
    }
  }

  function installXhrHook(win) {
    var proto = win && win.XMLHttpRequest && win.XMLHttpRequest.prototype;
    if (!proto || !XHR_URLS || typeof proto.open !== 'function') return false;
    var open = proto.open;
    var textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
    var responseDesc = Object.getOwnPropertyDescriptor(proto, 'response');
    try {
      proto.open = function () {
        try { XHR_URLS.set(this, arguments[1]); } catch (e) { /* opaque target */ }
        return open.apply(this, arguments);
      };
      if (textDesc && textDesc.get) {
        Object.defineProperty(proto, 'responseText', {
          configurable: true,
          enumerable: textDesc.enumerable,
          get: function () {
            var value = textDesc.get.call(this);
            return sanitizeTextForUrl(value, XHR_URLS.get(this) || '');
          },
        });
      }
      if (responseDesc && responseDesc.get) {
        Object.defineProperty(proto, 'response', {
          configurable: true,
          enumerable: responseDesc.enumerable,
          get: function () {
            var value = responseDesc.get.call(this);
            if (!isPlayerEndpoint(XHR_URLS.get(this) || '') || !value || typeof value !== 'object') return value;
            if (!active) return value;
            try { return sanitizePlayerResponse(value); } catch (e) { return value; }
          },
        });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function installFetchHook(win) {
    if (!win || typeof win.fetch !== 'function' || typeof win.Response !== 'function') return false;
    var original = win.fetch;
    try {
      win.fetch = function (input) {
        // uBO note: a Request uses .url, a URL object uses .href.
        var url = typeof input === 'string' ? input :
          (input && input.url) || (input && input.href) || '';
        var result = original.apply(this, arguments);
        var target = String(url || '');
        if (!isPlayerEndpoint(target) || !result || typeof result.then !== 'function') return result;
        return result.then(function (response) {
          if (!response || typeof response.clone !== 'function' || typeof response.text !== 'function') return response;
          return response.clone().text().then(function (text) {
            var clean = sanitizeTextForUrl(text, target);
            if (clean === text) return response;
            var headers = response.headers;
            if (typeof win.Headers === 'function' && headers) {
              try {
                headers = new win.Headers(headers);
                headers.delete('content-length');
                headers.delete('content-encoding');
              } catch (e) { /* keep the original headers */ }
            }
            var fresh;
            try {
              fresh = new win.Response(clean, {
                status: response.status,
                statusText: response.statusText,
                headers: headers,
              });
              Object.defineProperty(fresh, 'url', { value: response.url });
            } catch (e) {
              return response;
            }
            return fresh;
          }).catch(function () { return response; });
        });
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  // Captured at document_start, before YouTube can tamper with timers
  // (uBO's nano-stb / AdGuard's adjust-setTimeout address the same issue).
  var nativeSetInterval = typeof window !== 'undefined' && typeof window.setInterval === 'function'
    ? window.setInterval
    : null;

  var active = true;
  var installed = false;
  var originalDescriptor = null;
  var storedValue;

  function installPlayerHook(target) {
    if (installed) return false;
    var owner = target || root;
    if (!owner) return false;
    try {
      originalDescriptor = Object.getOwnPropertyDescriptor(owner, 'ytInitialPlayerResponse') || null;
      storedValue = originalDescriptor && 'value' in originalDescriptor
        ? originalDescriptor.value
        : undefined;
      Object.defineProperty(owner, 'ytInitialPlayerResponse', {
        configurable: true,
        enumerable: originalDescriptor ? originalDescriptor.enumerable : true,
        get: function () { return storedValue; },
        set: function (next) { storedValue = active ? sanitizePlayerResponse(next) : next; },
      });
      installed = true;
      if (storedValue !== undefined) owner.ytInitialPlayerResponse = sanitizePlayerResponse(storedValue);
      return true;
    } catch (e) {
      return false;
    }
  }

  function uninstallPlayerHook(target) {
    if (!installed) return;
    var owner = target || root;
    try {
      if (originalDescriptor) Object.defineProperty(owner, 'ytInitialPlayerResponse', originalDescriptor);
      else delete owner.ytInitialPlayerResponse;
    } finally {
      installed = false;
      originalDescriptor = null;
    }
  }

  var AD_HIDE_SELECTORS = [
    '.ytp-ad-overlay-container',
    '.ytp-ad-text-overlay',
    '.ytp-ad-image-overlay',
    'ytd-ad-slot-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-inline-survey-renderer',
  ];

  function installAdCss(doc) {
    if (!doc || !doc.documentElement || doc.getElementById('shieldly-youtube-ads')) return false;
    try {
      var style = doc.createElement('style');
      style.id = 'shieldly-youtube-ads';
      style.textContent = AD_HIDE_SELECTORS.map(function (s) {
        return s + ' { display: none !important; }';
      }).join('\n');
      (doc.head || doc.documentElement).appendChild(style);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Last-resort layer for ads stitched into the video stream: watch for the
  // player's `ad-showing` state, click its skip button, or fast-forward.
  // AdGuard's active YouTube rule tracks SSAP entities pushed by the player
  // (namespace "ssap", start/end in microseconds) and seeks past them.
  var ssapEntities = [];
  var ssapIds = [];
  var ssapCapturing = false;
  var ssapSeen = '';

  function installSsapTracker(win) {
    var Arr = win && win.Array;
    if (!Arr || typeof Arr.prototype.push !== 'function') return false;
    var originalPush = Arr.prototype.push;
    try {
      Arr.prototype.push = function () {
        try {
          var entry = arguments[0];
          var flags = win.yt && win.yt.config_ && win.yt.config_.EXPERIMENT_FLAGS;
          if (flags && flags.html5_enable_ssap_entity_id && entry && typeof entry === 'object' &&
              entry.namespace === 'ssap' && entry.id && typeof entry.start === 'number' &&
              typeof entry.end === 'number') {
            if (!ssapCapturing && entry.start !== 0 && ssapIds.indexOf(entry.id) === -1) {
              ssapEntities.length = 0;
              ssapIds.length = 0;
              ssapCapturing = true;
            }
            if (ssapCapturing && entry.start !== 0 && ssapIds.indexOf(entry.id) === -1) {
              ssapEntities.push(entry);
              ssapIds.push(entry.id);
            }
          }
        } catch (e) { /* unrelated array push */ }
        return originalPush.apply(this, arguments);
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  function skipSsapEntity(doc) {
    if (!ssapEntities.length) return false;
    var video = doc.querySelector('video');
    if (!video) return false;
    var last = ssapEntities[ssapEntities.length - 1];
    var duration = Math.round(video.duration);
    var end = Math.round(last.end / 1000);
    var ids = ssapIds.join(',');
    if (!isFinite(duration) || !duration || duration !== end || ssapSeen === ids) return false;
    var start = last.start / 1000;
    if (video.currentTime < start) video.currentTime = start;
    ssapCapturing = false;
    ssapSeen = ids;
    return true;
  }

  function installAdSkipper(win) {
    var doc = win && win.document;
    var interval = nativeSetInterval || (win && win.setInterval);
    if (!doc || typeof interval !== 'function') return false;
    interval(function () {
      if (!active) return;
      if (skipSsapEntity(doc)) return;
      var player = doc.getElementById('movie_player') || doc.querySelector('.html5-video-player');
      if (!player) return;

      // uBO's current YouTube fix identifies stitched ads through this exact
      // debug flag. A plain `ad-showing` class is the older client-side path.
      var stats = typeof player.getStatsForNerds === 'function' ? player.getStatsForNerds() : null;
      var debug = stats && stats.debug_info ? String(stats.debug_info) : '';
      var stitched = debug.indexOf('SSAP, AD') === 0;
      var adShowing = stitched || !!(player.classList && player.classList.contains('ad-showing'));
      if (!adShowing) return;

      var buttons = doc.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button[class*="ytp-ad-skip"]');
      for (var i = 0; i < buttons.length; i += 1) {
        try {
          if (buttons[i].offsetParent !== null && typeof buttons[i].click === 'function') {
            buttons[i].click();
            return;
          }
        } catch (e) { /* detached button */ }
      }

      // Only seek for the stitched case — seeking a normal ad that is not
      // actually stitched can break playback with a playability error.
      if (stitched) {
        var progress = typeof player.getProgressState === 'function' ? player.getProgressState() : null;
        if (progress && progress.duration > 0 && typeof player.seekTo === 'function') {
          try { player.seekTo(progress.duration, true); } catch (e) { /* not ready */ }
        }
      }
    }, 300);
    return true;
  }

  function setActive(value) {
    active = value !== false;
    if (typeof document !== 'undefined') {
      var style = document.getElementById('shieldly-youtube-ads');
      if (active && !style) installAdCss(document);
      if (!active && style && typeof style.remove === 'function') style.remove();
    }
  }

  function onMessage(event) {
    var data = event && event.data;
    if (!data || data.source !== 'shieldly' || data.type !== 'youtube-toggle') return;
    setActive(data.enabled);
  }

  var api = {
    isYouTubeHost: isYouTubeHost,
    sanitizePlayerResponse: sanitizePlayerResponse,
    isPlayerEndpoint: isPlayerEndpoint,
    sanitizeJsonText: sanitizeJsonText,
    sanitizeTextForUrl: sanitizeTextForUrl,
    installXhrHook: installXhrHook,
    installFetchHook: installFetchHook,
    installAdCss: installAdCss,
    installAdSkipper: installAdSkipper,
    installSsapTracker: installSsapTracker,
    skipSsapEntity: skipSsapEntity,
    installPlayerHook: installPlayerHook,
    uninstallPlayerHook: uninstallPlayerHook,
    setActive: setActive,
    get active() { return active; },
  };

  if (typeof globalThis !== 'undefined') globalThis.ShieldlyYouTube = api;

  if (typeof window !== 'undefined') {
    if (isYouTubeHost(window.location && window.location.hostname)) {
      // Diagnostic first: even if a hook below fails, the popup must be able
      // to tell whether this script ran at all.
      function reportReady() {
        try {
          if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.setAttribute('data-shieldly-youtube', 'active');
          }
          if (window.postMessage) {
            window.postMessage({ source: 'shieldly', type: 'youtube-ready' }, '*');
          }
        } catch (e) { /* diagnostic only */ }
      }
      reportReady();
      if (window.addEventListener) {
        window.addEventListener('DOMContentLoaded', reportReady, true);
        window.addEventListener('message', onMessage, true);
      }
      var diagTimer = nativeSetInterval || window.setInterval;
      if (typeof diagTimer === 'function') {
        var reports = 0;
        var diag = diagTimer(function () {
          reportReady();
          reports += 1;
          if (reports >= 5 && window.clearInterval) window.clearInterval(diag);
        }, 1000);
      }
      installPlayerHook(window);
      installXhrHook(window);
      installFetchHook(window);
      installSsapTracker(window);
      installAdCss(typeof document !== 'undefined' ? document : null);
      installAdSkipper(window);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
