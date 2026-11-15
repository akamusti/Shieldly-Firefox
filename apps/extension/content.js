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
 *
 * The script also blocks single elements: the browser context menu offers
 * "Privacy Shield → Block element", and the element under the pointer is
 * turned into a site-specific cosmetic rule (`example.com##.ad`). The popup
 * offers the same action through the element picker.
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

  // --- user rules (blocked elements) ---------------------------------------
  //
  // A blocked element is stored as a site-specific cosmetic rule
  // (`example.com##.ad`), the same format the filter lists use.

  function ruleFor(selector) {
    return `${host}##${selector}`;
  }

  async function addCustomRule(rule) {
    const { customCosmetic = [] } = await api.storage.local.get('customCosmetic');
    if (customCosmetic.includes(rule)) return false;
    await api.storage.local.set({ customCosmetic: [...customCosmetic, rule] });
    return true;
  }

  async function removeCustomRule(rule) {
    const { customCosmetic = [] } = await api.storage.local.get('customCosmetic');
    if (!customCosmetic.includes(rule)) return false;
    await api.storage.local.set({
      customCosmetic: customCosmetic.filter((entry) => entry !== rule),
    });
    return true;
  }

  // The element the user right-clicked. Chrome does not tell the background
  // where the pointer was, so the content script remembers it itself and only
  // reports which frame it belongs to.
  let contextTarget = null;

  function elementFromEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const first = path && path.length ? path[0] : event.target;
    if (first && first.nodeType === 1) return first;
    return event.target && event.target.nodeType === 1 ? event.target : null;
  }

  document.addEventListener('contextmenu', (event) => {
    const element = elementFromEvent(event);
    if (!element) return;
    contextTarget = element;
    try {
      const pending = api.runtime.sendMessage({ type: 'contextTargetReady' });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // No background page; the picker still works.
    }
  }, true);

  // Blocks the element the user right-clicked and stores the rule so the
  // element stays hidden on the next visit.
  async function blockElement() {
    if (stateLoaded && !state.active) {
      showToast('Protection is paused on this site');
      return { ok: false, reason: 'disabled' };
    }
    const element = contextTarget;
    if (!element || !element.isConnected) return { ok: false, reason: 'no-target' };
    const selector = makeSelector(element);
    if (!selector) return { ok: false, reason: 'no-selector' };
    const rule = ruleFor(selector);
    await addCustomRule(rule);
    if (!state.specific.includes(selector)) state.specific.push(selector);
    render(postDomDone);
    showToast('Element blocked', 'Undo', () => {
      removeCustomRule(rule);
    });
    return { ok: true, selector };
  }

  // --- toast ----------------------------------------------------------------

  const TOAST_ID = 'privacy-shield-toast';
  let toastTimer = null;

  function setStyles(element, styles) {
    for (const [property, value] of Object.entries(styles)) {
      element.style.setProperty(property, value, 'important');
    }
  }

  function removeToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();
  }

  function showToast(message, actionLabel, onAction) {
    removeToast();
    if (!document.body) return;
    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.setAttribute('role', 'status');
    setStyles(toast, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      'z-index': '2147483647',
      display: 'flex',
      'align-items': 'center',
      gap: '12px',
      'max-width': '340px',
      padding: '10px 12px',
      'border-radius': '10px',
      background: '#121924',
      color: '#e6e6e6',
      border: '1px solid #243044',
      'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      'font-size': '13px',
      'line-height': '1.4',
      'box-shadow': '0 8px 24px rgba(0, 0, 0, 0.35)',
    });

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    if (actionLabel && typeof onAction === 'function') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = actionLabel;
      setStyles(button, {
        background: 'transparent',
        border: '1px solid #2dd4bf',
        color: '#2dd4bf',
        'border-radius': '6px',
        padding: '4px 10px',
        cursor: 'pointer',
        'font-size': '12px',
      });
      button.addEventListener('click', () => {
        removeToast();
        onAction();
      });
      toast.appendChild(button);
    }

    document.body.appendChild(toast);
    toastTimer = setTimeout(removeToast, 4500);
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
  // True once the first load finished; before that the state is still unknown.
  let stateLoaded = false;

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
    stateLoaded = true;
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

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'blockedResources') {
      onBlockedResources(msg.urls);
      return undefined;
    }
    if (msg && msg.type === 'startPicker') {
      startPicker();
      return undefined;
    }
    if (msg && msg.type === 'blockElement') {
      blockElement().then(
        (result) => sendResponse(result),
        () => sendResponse({ ok: false, reason: 'error' }),
      );
      return true;
    }
    return undefined;
  });

  // --- element picker ------------------------------------------------------
  //
  // The selector generator mirrors buildElementSelector() in
  // @privacy-shield/cosmetic-filter (extensions ship plain JS, so the logic
  // is mirrored instead of imported).

  function escapeCssIdentifier(value) {
    if (value === '') return '';
    let result = '';
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code === 0x0000) {
        result += '\uFFFD';
        continue;
      }
      if ((code >= 0x0001 && code <= 0x001f) || code === 0x007f) {
        result += `\\${code.toString(16)} `;
        continue;
      }
      if (index === 0 && code >= 0x0030 && code <= 0x0039) {
        result += `\\${code.toString(16)} `;
        continue;
      }
      if (index === 1 && code >= 0x0030 && code <= 0x0039 && value.charCodeAt(0) === 0x002d) {
        result += `\\${code.toString(16)} `;
        continue;
      }
      if (index === 0 && code === 0x002d && value.length === 1) {
        result += '\\-';
        continue;
      }
      if (
        code >= 0x0080 ||
        code === 0x002d ||
        code === 0x005f ||
        (code >= 0x0030 && code <= 0x0039) ||
        (code >= 0x0041 && code <= 0x005a) ||
        (code >= 0x0061 && code <= 0x007a)
      ) {
        result += value[index];
        continue;
      }
      result += `\\${value[index]}`;
    }
    return result;
  }

  // Generated class names (css-1x2y3z, sc-AbCdEf12) change with every build,
  // so a rule built on them would stop working after the next deploy.
  function isVolatileClass(value) {
    if (!value) return true;
    if (/^[a-z]{1,3}-[0-9a-z]{4,}$/i.test(value) && /\d/.test(value)) return true;
    if (/^[a-z]+[0-9a-f]{8,}$/i.test(value)) return true;
    if (/\d{7,}/.test(value)) return true;
    if (/^[A-Za-z]{2,}[0-9]{3,}$/.test(value)) return true;
    return false;
  }

  const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'data-ad', 'data-slot', 'name', 'role', 'type'];
  const MAX_ATTRIBUTE_VALUE_LENGTH = 64;
  const MAX_SELECTOR_DEPTH = 8;

  function attributeCandidates(snapshot) {
    const attributes = snapshot.attributes || {};
    const candidates = [];
    for (const name of STABLE_ATTRIBUTES) {
      const value = attributes[name];
      if (typeof value === 'string' && value !== '' && value.length <= MAX_ATTRIBUTE_VALUE_LENGTH) {
        candidates.push([name, value]);
      }
    }
    for (const [name, value] of Object.entries(attributes)) {
      if (!name.startsWith('data-')) continue;
      if (candidates.some(([existing]) => existing === name)) continue;
      if (typeof value !== 'string' || value === '' || value.length > MAX_ATTRIBUTE_VALUE_LENGTH) continue;
      candidates.push([name, value]);
    }
    return candidates;
  }

  function snapshotFor(el, depth) {
    const parent = el.parentElement;
    let nthOfType = 0;
    let sameTagSiblings = 0;
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === el.tagName);
      sameTagSiblings = siblings.length;
      nthOfType = siblings.indexOf(el) + 1;
    }
    const attributes = {};
    for (const attr of el.attributes) attributes[attr.name] = attr.value;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList),
      attributes,
      nthOfType,
      sameTagSiblings,
      parent: depth < MAX_SELECTOR_DEPTH && parent ? snapshotFor(parent, depth + 1) : null,
    };
  }

  function matchCount(selector) {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      // The browser rejected the selector.
      return 0;
    }
  }

  // Builds the most specific selector that still matches exactly one element:
  // #id, then tag.classes, then a stable attribute, then a parent path.
  function buildElementSelector(snapshot) {
    if (!snapshot || !snapshot.tag) return '';

    if (snapshot.id) {
      const selector = `#${escapeCssIdentifier(snapshot.id)}`;
      if (matchCount(selector) === 1) return selector;
    }

    const classes = (snapshot.classes || []).filter((name) => name && !isVolatileClass(name));
    for (let take = Math.min(classes.length, 3); take >= 1; take--) {
      const combo = classes.slice(0, take).map(escapeCssIdentifier).join('.');
      const selector = `${snapshot.tag}.${combo}`;
      if (matchCount(selector) === 1) return selector;
    }

    for (const [name, value] of attributeCandidates(snapshot)) {
      const selector = `${snapshot.tag}[${name}="${cssAttributeValue(value)}"]`;
      if (matchCount(selector) === 1) return selector;
    }

    const segments = [];
    let current = snapshot;
    let depth = 0;
    while (current && depth <= MAX_SELECTOR_DEPTH) {
      let segment = current.tag;
      const total = current.sameTagSiblings || 0;
      const nth = current.nthOfType || 0;
      if (nth && total > 1) segment = `${current.tag}:nth-of-type(${nth})`;
      if (depth > 0 && current.id) {
        const idSelector = `#${escapeCssIdentifier(current.id)}`;
        if (matchCount(idSelector) === 1) {
          segments.push(idSelector);
          break;
        }
      }
      segments.push(segment);
      current = current.parent || null;
      depth++;
    }

    for (let length = 1; length <= segments.length; length++) {
      const candidate = segments.slice(0, length).join(' > ');
      if (matchCount(candidate) === 1) return candidate;
    }
    return segments[0] || snapshot.tag;
  }

  function makeSelector(el) {
    return buildElementSelector(snapshotFor(el, 0));
  }

  function stopPicker() {
    picking = false;
    if (highlight) {
      highlight.remove();
      highlight = null;
    }
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
  }

  function startPicker() {
    picking = true;
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (!picking) return;
    if (e.key !== 'Escape') return;
    e.preventDefault();
    stopPicker();
    showToast('Element picker cancelled');
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
    const selector = makeSelector(e.target);
    stopPicker();
    if (!selector) return;
    const rule = ruleFor(selector);
    await addCustomRule(rule);
    if (!state.specific.includes(selector)) state.specific.push(selector);
    render(postDomDone);
    showToast('Element blocked', 'Undo', () => {
      removeCustomRule(rule);
    });
  }
})();
