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

  /** Returns a copy with ad scheduling fields removed. Never mutates input. */
  function sanitizePlayerResponse(response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
    var copy;
    try {
      copy = JSON.parse(JSON.stringify(response));
    } catch (e) {
      return response;
    }
    for (var i = 0; i < AD_FIELDS.length; i += 1) {
      var field = AD_FIELDS[i];
      if (!(field in copy)) continue;
      if (EMPTY_ARRAYS.indexOf(field) !== -1 && Array.isArray(copy[field])) copy[field] = [];
      else delete copy[field];
    }
    return copy;
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
    installPlayerHook: installPlayerHook,
    uninstallPlayerHook: uninstallPlayerHook,
    setActive: setActive,
    get active() { return active; },
  };

  if (typeof globalThis !== 'undefined') globalThis.ShieldlyYouTube = api;

  if (typeof window !== 'undefined') {
    if (isYouTubeHost(window.location && window.location.hostname)) {
      installPlayerHook(window);
      if (window.addEventListener) window.addEventListener('message', onMessage, true);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
