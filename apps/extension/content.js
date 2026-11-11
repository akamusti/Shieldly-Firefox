/*
 * Privacy Shield content script — cosmetic filtering.
 *
 * Mirrors the three cosmetic classes implemented in
 * @privacy-shield/cosmetic-filter (extensions ship plain JS, so the logic is
 * mirrored instead of imported):
 *
 *   specific        -> injected at document_start (no flicker)
 *   generic         -> injected once the DOM exists (cacheable, may flicker once)
 *   cached generic  -> generic selectors that matched here before, injected at
 *                      document_start (no flicker on later visits)
 *
 * Blocked requests leave an empty placeholder element behind. Those are
 * collapsed and the selectors are remembered as temporary site-specific
 * filters, so the placeholder never renders again.
 *
 * Hiding is cosmetic only: it removes no request, so the popup reports it
 * separately from the blocked counter.
 */
(function () {
  const api = typeof browser !== 'undefined' ? browser : chrome;

  const STYLE_ID = 'privacy-shield-cosmetic';
  const GENERIC_CACHE_KEY = 'cosmeticCache';
  const COLLAPSE_CACHE_KEY = 'collapseCache';
  const HIDE = 'display: none !important;';
  const CHUNK_SIZE = 50;
  const MAX_SELECTORS_PER_HOST = 400;
  const MAX_HOSTS = 250;
  const MAX_SCANNED_SELECTORS = 250;
  const MAX_COLLAPSED_URLS = 80;

  const host = location.hostname;

  // --- rule parsing -------------------------------------------------------

  function normalizeHost(value) {
    return value.trim().toLowerCase().replace(/\.$/, '');
  }

  function sameHost(hostname, other) {
    if (!hostname || !other) return false;
    return hostname === other || hostname.endsWith(`.${other}`);
  }

  function splitHosts(text) {
    const hosts = [];
    const excluded = [];
    for (const part of text.split(',')) {
      const entry = normalizeHost(part);
      if (entry === '' || entry === '*') continue;
      if (entry.startsWith('~')) {
        const bare = normalizeHost(entry.slice(1));
        if (bare && bare !== '*') excluded.push(bare);
        continue;
      }
      if (!hosts.includes(entry)) hosts.push(entry);
    }
    return { hosts, excluded };
  }

  const MARKER = /^([^#]*?)#(@?)([?$%^]?)#(.+)$/;

  function parseRuleEntry(entry) {
    if (typeof entry !== 'string') return null;
    const match = MARKER.exec(entry.trim());
    if (!match) return null;
    const selector = (match[4] || '').trim();
    if (!selector) return null;
    const { hosts, excluded } = splitHosts(match[1] || '');
    return { selector, hosts, excluded, generic: hosts.length === 0, exception: match[2] === '@' };
  }

  function ruleAppliesTo(rule, siteHost) {
    if (rule.excluded.some((domain) => sameHost(siteHost, domain))) return false;
    if (rule.hosts.length === 0) return true;
    return rule.hosts.some((domain) => sameHost(siteHost, domain));
  }

  // --- caches (mirror of GenericCosmeticCache) ----------------------------

  function emptyCache() {
    return { version: 1, hosts: {} };
  }

  function sanitizeCache(raw) {
    if (!raw || raw.version !== 1 || !raw.hosts || typeof raw.hosts !== 'object') return emptyCache();
    const hosts = {};
    for (const [key, value] of Object.entries(raw.hosts)) {
      if (!Array.isArray(value)) continue;
      const list = value
        .filter((selector) => typeof selector === 'string' && selector.trim() !== '')
        .slice(-MAX_SELECTORS_PER_HOST);
      if (list.length) hosts[key] = list;
    }
    return { version: 1, hosts };
  }

  function cacheGet(cache, key) {
    return (cache.hosts[key] || []).slice();
  }

  function cacheRemember(cache, key, selectors) {
    if (!key || !selectors.length) return false;
    const existing = cache.hosts[key] || [];
    const seen = new Set(existing);
    const merged = existing.slice();
    for (const selector of selectors) {
      const value = selector.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      merged.push(value);
    }
    if (merged.length > MAX_SELECTORS_PER_HOST) merged.splice(0, merged.length - MAX_SELECTORS_PER_HOST);
    delete cache.hosts[key];
    cache.hosts[key] = merged;
    const keys = Object.keys(cache.hosts);
    for (let i = 0; i < keys.length - MAX_HOSTS; i++) delete cache.hosts[keys[i]];
    return true;
  }

  function persist(key, cache) {
    try {
      const pending = api.storage.local.set({ [key]: cache });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // Storage full or unavailable; the in-memory copy still applies.
    }
  }

  // --- CSS -----------------------------------------------------------------

  function cssAttributeValue(value) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\n\r\f]/g, '\\A ');
  }

  function isUsableSelector(selector) {
    if (!selector) return false;
    if (/[{};]/.test(selector)) return false;
    for (const [open, close] of [['(', ')'], ['[', ']']]) {
      let depth = 0;
      for (const char of selector) {
        if (char === open) depth += 1;
        if (char === close) depth -= 1;
        if (depth < 0) return false;
      }
      if (depth !== 0) return false;
    }
    return true;
  }

  // Mirrors buildCosmeticCss(): dedupe, :is() chunks, standalone pseudo-elements.
  function buildCss(selectors) {
    const seen = new Set();
    const standalone = [];
    const groupable = [];
    for (const raw of selectors) {
      const selector = String(raw).trim();
      if (!isUsableSelector(selector) || seen.has(selector)) continue;
      seen.add(selector);
      if (selector.includes('::')) standalone.push(selector);
      else groupable.push(selector);
    }
    const lines = [];
    for (const selector of standalone) lines.push(`${selector} { ${HIDE} }`);
    for (let i = 0; i < groupable.length; i += CHUNK_SIZE) {
      const chunk = groupable.slice(i, i + CHUNK_SIZE);
      if (chunk.length === 1) lines.push(`${chunk[0]} { ${HIDE} }`);
      else lines.push(`:is(${chunk.join(', ')}) { ${HIDE} }`);
    }
    return lines.join('\n');
  }

  // --- state ---------------------------------------------------------------

  const state = {
    active: false,
    generichide: false,
    specific: [],
    generic: [],
    exceptions: new Set(),
    cachedGeneric: [],
    collapsed: [],
  };

  const caches = { generic: emptyCache(), collapse: emptyCache() };
  const blockedUrls = new Set();

  let picking = false;
  let highlight = null;
  let styleEl = null;
  let lastCss = '';
  let postDomDone = false;
  let countTimer = null;

  function appliedSelectors(includeGeneric) {
    const out = [];
    const push = (value) => {
      if (!value || state.exceptions.has(value)) return;
      out.push(value);
    };
    state.specific.forEach(push);
    state.cachedGeneric.forEach(push);
    if (includeGeneric && !state.generichide) state.generic.forEach(push);
    state.collapsed.forEach(push);
    return out;
  }

  function ensureStyle() {
    if (styleEl && styleEl.isConnected) return styleEl;
    styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }

  function removeStyle() {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
    lastCss = '';
  }

  function render(includeGeneric) {
    if (!state.active) {
      removeStyle();
      return;
    }
    const css = buildCss(appliedSelectors(includeGeneric));
    if (css === lastCss) return;
    lastCss = css;
    ensureStyle().textContent = css;
    scheduleHiddenCount();
  }

  // --- statistics ----------------------------------------------------------

  function scan(selectors, limit) {
    const matched = [];
    let elements = 0;
    for (const selector of selectors.slice(0, limit)) {
      try {
        const hits = document.querySelectorAll(selector).length;
        if (hits === 0) continue;
        matched.push(selector);
        elements += hits;
      } catch {
        // Invalid selector for this browser; skip it.
      }
    }
    return { matched, elements };
  }

  function reportHidden() {
    if (!state.active || !document.body) return;
    const { elements } = scan(appliedSelectors(true), MAX_SCANNED_SELECTORS);
    if (elements === 0) return;
    try {
      const pending = api.runtime.sendMessage({
        type: 'cosmeticStats',
        hidden: Math.min(elements, 5000),
      });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // Background gone; the next page load will report again.
    }
  }

  function scheduleHiddenCount() {
    if (countTimer) return;
    countTimer = setTimeout(() => {
      countTimer = null;
      reportHidden();
    }, 400);
  }

  // --- blocked placeholder collapse ---------------------------------------

  const COLLAPSE_ATTRS = [
    ['img', 'src'],
    ['img', 'data-src'],
    ['img', 'data-lazy-src'],
    ['iframe', 'src'],
    ['frame', 'src'],
    ['script', 'src'],
    ['link', 'href'],
    ['source', 'src'],
    ['video', 'src'],
    ['video', 'poster'],
    ['audio', 'src'],
    ['embed', 'src'],
    ['object', 'data'],
    ['track', 'src'],
  ];
  const PREFIX_TAGS = new Set(['img', 'iframe', 'script', 'link']);

  // Mirrors selectorsForBlockedResource() in @privacy-shield/cosmetic-filter.
  function collapseSelectorsFor(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return [];
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
    const exact = cssAttributeValue(parsed.href);
    const prefix = cssAttributeValue(`${parsed.protocol}//${parsed.host}/`);
    const selectors = [];
    for (const [tag, attribute] of COLLAPSE_ATTRS) {
      selectors.push(`${tag}[${attribute}="${exact}"]`);
      if (PREFIX_TAGS.has(tag) && (attribute === 'src' || attribute === 'href')) {
        selectors.push(`${tag}[${attribute}^="${prefix}"]`);
      }
    }
    return selectors;
  }

  function collapseUrl(url) {
    const selectors = collapseSelectorsFor(url);
    if (!selectors.length || state.collapsed.length >= MAX_SELECTORS_PER_HOST) return;
    const added = [];
    for (const selector of selectors) {
      if (state.collapsed.length + added.length >= MAX_SELECTORS_PER_HOST) break;
      if (state.collapsed.includes(selector) || added.includes(selector)) continue;
      try {
        // Only collapse what this page actually rendered.
        if (!document.querySelector(selector)) continue;
      } catch {
        continue;
      }
      added.push(selector);
    }
    if (!added.length) return;
    state.collapsed.push(...added);
    render(true);
    if (cacheRemember(caches.collapse, host, state.collapsed)) {
      persist(COLLAPSE_CACHE_KEY, caches.collapse);
    }
  }

  function onBlockedResources(urls) {
    if (!Array.isArray(urls) || !state.active) return;
    let fresh = false;
    for (const url of urls) {
      if (typeof url !== 'string' || url === '' || blockedUrls.has(url)) continue;
      blockedUrls.add(url);
      fresh = true;
      if (blockedUrls.size > MAX_COLLAPSED_URLS) {
        const oldest = blockedUrls.values().next();
        if (!oldest.done) blockedUrls.delete(oldest.value);
      }
      collapseUrl(url);
    }
    if (fresh) scheduleHiddenCount();
  }

  // Only collapse failures whose URL the network layer actually blocked: a
  // plain 404 image must stay visible.
  function onResourceError(event) {
    const target = event.target;
    if (!target || target === window || !target.tagName) return;
    const url = target.currentSrc || target.src || target.href;
    if (typeof url !== 'string' || url === '' || !blockedUrls.has(url)) return;
    collapseUrl(url);
  }

  window.addEventListener('error', onResourceError, true);

  // --- load ----------------------------------------------------------------

  function pushUnique(list, seen, value) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    list.push(value);
  }

  async function loadState() {
    const stored = await api.storage.local.get([
      'enabled',
      'disabledSites',
      'siteSettings',
      'cosmeticSelectors',
      'cosmeticGeneric',
      'cosmeticExceptions',
      'customCosmetic',
      GENERIC_CACHE_KEY,
      COLLAPSE_CACHE_KEY,
    ]);

    const site = (stored.siteSettings || {})[host] || {};
    const siteDisabled = (stored.disabledSites || []).includes(host) || site.enabled === false;
    const cosmeticEnabled = typeof site.cosmeticFiltering === 'boolean' ? site.cosmeticFiltering : true;
    state.active = stored.enabled !== false && !siteDisabled && cosmeticEnabled;

    caches.generic = sanitizeCache(stored[GENERIC_CACHE_KEY]);
    caches.collapse = sanitizeCache(stored[COLLAPSE_CACHE_KEY]);

    const specific = [];
    const generic = [];
    const exceptions = new Set();
    const specificSeen = new Set();
    const genericSeen = new Set();
    let generichide = false;

    for (const entry of [...(stored.cosmeticSelectors || []), ...(stored.customCosmetic || [])]) {
      const rule = parseRuleEntry(entry);
      if (!rule || rule.generic || rule.exception || !ruleAppliesTo(rule, host)) continue;
      pushUnique(specific, specificSeen, rule.selector);
    }
    for (const entry of stored.cosmeticGeneric || []) {
      const rule = parseRuleEntry(entry);
      if (!rule || !rule.generic || rule.exception || !ruleAppliesTo(rule, host)) continue;
      pushUnique(generic, genericSeen, rule.selector);
    }
    for (const entry of stored.cosmeticExceptions || []) {
      const rule = parseRuleEntry(entry);
      if (!rule || !ruleAppliesTo(rule, host)) continue;
      if (rule.generic) generichide = true;
      else exceptions.add(rule.selector);
    }

    state.specific = specific;
    state.generic = generic;
    state.exceptions = exceptions;
    state.generichide = generichide;
    state.cachedGeneric = cacheGet(caches.generic, host);
    state.collapsed = cacheGet(caches.collapse, host);
  }

  async function apply() {
    try {
      await loadState();
    } catch {
      return;
    }
    render(postDomDone);
    if (!state.active) return;
    if (postDomDone) rememberGeneric();
    else whenDomReady(applyPostDom);
  }

  function whenDomReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function applyPostDom() {
    postDomDone = true;
    render(true);
    rememberGeneric();
  }

  // Generic selectors are cached per host only when they match something, so
  // the cache stays small and the next visit can hide them before paint.
  function rememberGeneric() {
    if (!state.active || state.generichide) return;
    const candidates = state.generic.filter((selector) => !state.exceptions.has(selector));
    if (!candidates.length) return;
    const { matched } = scan(candidates, MAX_SCANNED_SELECTORS);
    if (!matched.length) return;
    if (cacheRemember(caches.generic, host, matched)) persist(GENERIC_CACHE_KEY, caches.generic);
  }

  apply();

  api.storage.onChanged.addListener((changes) => {
    if (
      changes.enabled ||
      changes.disabledSites ||
      changes.siteSettings ||
      changes.cosmeticSelectors ||
      changes.cosmeticGeneric ||
      changes.cosmeticExceptions ||
      changes.customCosmetic
    ) {
      apply();
    }
  });

  api.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'blockedResources') {
      onBlockedResources(msg.urls);
      return;
    }
    if (msg && msg.type === 'startPicker') {
      picking = true;
      document.addEventListener('mouseover', onOver, true);
      document.addEventListener('click', onClick, true);
    }
  });

  // --- element picker ------------------------------------------------------

  function selectorFor(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const cls = Array.from(el.classList).filter(Boolean).slice(0, 2);
    if (cls.length) return `${el.tagName.toLowerCase()}.${cls.map(CSS.escape).join('.')}`;
    let path = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (siblings.length > 1) path += `:nth-of-type(${siblings.indexOf(el) + 1})`;
    }
    return path;
  }

  function stopPicker() {
    picking = false;
    if (highlight) {
      highlight.remove();
      highlight = null;
    }
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('click', onClick, true);
  }

  function onOver(e) {
    if (!picking) return;
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.style.cssText =
        'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7dd3fc;background:rgba(125,211,252,0.15);';
      document.documentElement.appendChild(highlight);
    }
    const r = e.target.getBoundingClientRect();
    highlight.style.top = `${r.top}px`;
    highlight.style.left = `${r.left}px`;
    highlight.style.width = `${r.width}px`;
    highlight.style.height = `${r.height}px`;
  }

  async function onClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    const selector = selectorFor(e.target);
    const { customCosmetic = [] } = await api.storage.local.get('customCosmetic');
    await api.storage.local.set({
      customCosmetic: Array.from(new Set([...customCosmetic, `${host}##${selector}`])),
    });
    stopPicker();
  }
})();
