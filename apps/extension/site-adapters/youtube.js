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

  function isPlayerEndpoint(url) {
    var value = String(url || '');
    if (!/\/youtubei\/v\d+\/player(?:[?/#]|$)/i.test(value)) return false;
    return /(^|\.)youtube\.com/i.test(value) || value.indexOf('/youtubei/') === 0;
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
            return isPlayerEndpoint(XHR_URLS.get(this) || '') ? sanitizeJsonText(value) : value;
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
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var result = original.apply(this, arguments);
        if (!isPlayerEndpoint(url) || !result || typeof result.then !== 'function') return result;
        return result.then(function (response) {
          if (!response || typeof response.clone !== 'function' || typeof response.text !== 'function') return response;
          return response.clone().text().then(function (text) {
            var clean = sanitizeJsonText(text);
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

  function setActive(value) {
    active = value !== false;
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
    installXhrHook: installXhrHook,
    installFetchHook: installFetchHook,
    installPlayerHook: installPlayerHook,
    uninstallPlayerHook: uninstallPlayerHook,
    setActive: setActive,
    get active() { return active; },
  };

  if (typeof globalThis !== 'undefined') globalThis.ShieldlyYouTube = api;

  if (typeof window !== 'undefined') {
    if (isYouTubeHost(window.location && window.location.hostname)) {
      installPlayerHook(window);
      installXhrHook(window);
      installFetchHook(window);
      if (window.addEventListener) window.addEventListener('message', onMessage, true);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
