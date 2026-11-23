/*
 * Shieldly — anti-blocker defusers (page / MAIN world, document_start).
 *
 * Mirrors the small, widely used subset of uBlock Origin / AdGuard scriptlets:
 *   set-constant, abort-on-property-read, prevent-setTimeout, noeval-if.
 * All executable code lives in this local file. Sites never supply code —
 * the data below is compiled into the extension from @privacy-shield/cosmetic-filter.
 */
(function () {
  'use strict';

  const FLAGS = [
    ['adblock', 'false'], ['adBlockDetected', 'false'],
    ['adblockerDetected', 'false'], ['adsBlocked', 'false'],
    ['hasAdBlocker', 'false'], ['isAdblock', 'false'],
    ['scriptBlocked', 'false'], ['displayAdblockOverlay', 'false'],
    ['DHAntiAdBlocker', 'true'], ['ai_adb_detected', 'noopFunc'],
    ['pp_adblock_is_off', 'true'], ['admiral', 'noopFunc'],
    ['Object.prototype.DetectAdblock', 'noopFunc'],
  ];
  const ABORT_PROPERTIES = [
    'antiAdBlockerHandler', 'checkAdblockBait',
    'DisplayAcceptableAdIfAdblocked', 'adblockDetector',
  ];

  function valueOf(token) {
    switch (token) {
      case 'false': return false;
      case 'true': return true;
      case 'null': return null;
      case 'undefined': return undefined;
      case 'noopFunc': return function () {};
      case 'emptyObj': return {};
      case 'emptyArr': return [];
      default: return token;
    }
  }

  function defineFlag(path, token) {
    try {
      const parts = path.split('.');
      let owner = window;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        const next = owner[key];
        if (next === undefined || next === null ||
            (typeof next !== 'object' && typeof next !== 'function')) {
          Object.defineProperty(owner, key, { value: {}, configurable: true, writable: true });
        }
        owner = owner[key];
        if (!owner) return;
      }
      const prop = parts[parts.length - 1];
      const value = valueOf(token);
      // configurable keeps us compatible with companion blockers (e.g. AdGuard
      // Extra) that may want to install their own scriptlet on the same global.
      Object.defineProperty(owner, prop, { configurable: true, get: function () { return value; }, set: function () {} });
    } catch (e) {
      // A page may have locked the property already; leave it alone.
    }
  }

  function abortOnRead(prop) {
    try {
      Object.defineProperty(window, prop, {
        configurable: true,
        get: function () { throw new ReferenceError('privacy-shield-defused'); },
        set: function () {},
      });
    } catch (e) {
      // Already defined by the page.
    }
  }

  for (const [path, token] of FLAGS) defineFlag(path, token);
  for (const prop of ABORT_PROPERTIES) abortOnRead(prop);

})();
