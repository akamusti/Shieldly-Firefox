/*
 * Shieldly — YouTube anti-adblock defuser (YTROADMAP Faz 4).
 *
 * MAIN world, document_start, YouTube hosts only. This is the most fragile
 * layer: it removes the enforcement notice/overlay when YouTube responds to
 * an ad blocker, using local selectors and text checks only. No code is
 * downloaded from a filter list. Product positioning stays privacy-first;
 * this is a compatibility measure, not a "YouTube ad blocker" promise.
 */
(function (root) {
  'use strict';

  // Mirrored from @privacy-shield/shared (YOUTUBE_ENFORCEMENT_SELECTORS).
  var SELECTORS = [
    'ytd-enforcement-message-view-model',
    'ytd-playability-error-screen-renderer',
    '[class*="bkaEnforcement"]',
    '[class*="adblock-enforcement"]',
  ];
  var ENFORCEMENT_TEXT = [
    /ad[\s-]?block/i,
    /ad blocker/i,
    /reklam engel/i,
    /blocking ads/i,
  ];

  function isEnforcementText(text) {
    if (typeof text !== 'string' || text === '') return false;
    return ENFORCEMENT_TEXT.some(function (re) { return re.test(text); });
  }

  /** Removes an ad-block enforcement error screen from a player response. */
  function sanitizeEnforcementResponse(response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
    var copy;
    try {
      copy = JSON.parse(JSON.stringify(response));
    } catch (e) {
      return response;
    }
    var status = copy.playabilityStatus;
    if (status && status.errorScreen) {
      var renderer = status.errorScreen.playerErrorMessageRenderer || {};
      var parts = [];
      var runs = (renderer.reasonText && renderer.reasonText.runs) || [];
      for (var i = 0; i < runs.length; i += 1) {
        if (runs[i] && typeof runs[i].text === 'string') parts.push(runs[i].text);
      }
      if (renderer.subtitle && typeof renderer.subtitle.simpleText === 'string') {
        parts.push(renderer.subtitle.simpleText);
      }
      if (isEnforcementText(parts.join(' '))) {
        delete status.errorScreen;
        status.status = 'OK';
      }
    }
    if (copy.playerOverlays && isEnforcementText(JSON.stringify(copy.playerOverlays))) {
      delete copy.playerOverlays;
    }
    return copy;
  }

  var installed = false;
  var defuserActive = true;
  var previousGet = null;
  var previousSet = null;
  var stored;

  function setDefuserActive(value) {
    defuserActive = value !== false;
  }

  // Deliberately inert: rewriting playabilityStatus made YouTube show
  // "Bir hata oluştu" instead of the notice. The player adapter owns the
  // single ytInitialPlayerResponse accessor; this layer is CSS/DOM only.
  function installDefuser(target) {
    return false;
  }

  function installCss(doc) {
    if (!doc || !doc.documentElement || doc.getElementById('shieldly-youtube-defuser')) return false;
    try {
      var style = doc.createElement('style');
      style.id = 'shieldly-youtube-defuser';
      style.textContent = SELECTORS.map(function (s) { return s + ' { display: none !important; }'; }).join('\n');
      (doc.head || doc.documentElement).appendChild(style);
      return true;
    } catch (e) {
      return false;
    }
  }

  function installObserver(doc) {
    if (!doc || !doc.documentElement || typeof MutationObserver === 'undefined') return false;
    try {
      var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          var added = records[i].addedNodes || [];
          for (var j = 0; j < added.length; j += 1) {
            var node = added[j];
            if (!node || node.nodeType !== 1 || !node.matches) continue;
            try {
              if (node.matches(SELECTORS.join(','))) node.remove();
            } catch (e) {
              // A detached node or a selector the browser cannot parse.
            }
          }
        }
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    isEnforcementText: isEnforcementText,
    sanitizeEnforcementResponse: sanitizeEnforcementResponse,
    installDefuser: installDefuser,
    installCss: installCss,
    installObserver: installObserver,
    setDefuserActive: setDefuserActive,
    get active() { return defuserActive; },
    selectors: SELECTORS.slice(),
  };

  if (typeof globalThis !== 'undefined') globalThis.ShieldlyYouTubeDefuser = api;

  if (typeof window !== 'undefined') {
    var host = window.location && window.location.hostname;
    var value = String(host || '').trim().toLowerCase().replace(/\.$/, '');
    if (value === 'youtube.com' || value.endsWith('.youtube.com') || value === 'youtu.be') {
      installCss(typeof document !== 'undefined' ? document : null);
      installObserver(typeof document !== 'undefined' ? document : null);
      installDefuser(window);
      if (window.addEventListener) {
        window.addEventListener('message', function (event) {
          var data = event && event.data;
          if (!data || data.source !== 'shieldly' || data.type !== 'youtube-toggle') return;
          // Pausing leaves the page's own response untouched.
          setDefuserActive(data.enabled !== false);
        }, true);
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
