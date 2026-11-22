const BUILTIN_LISTS = [
  { id: 'easylist', name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { id: 'privacy-removeparam', name: 'AdGuard/uBO URL Tracking Protection', url: 'https://services.helium.imput.net/ubo/adguard-spyware-url/93b535a2/55a42892/privacy-removeparam.txt' },
  { id: 'peter-lowe-blocklist', name: "Peter Lowe's Blocklist", url: 'https://services.helium.imput.net/ubo/plowe-0/37f0810b/c20e4257/filters.txt' },
  { id: 'annoyances', name: 'AdGuard Annoyances filter', url: 'https://filters.adtidy.org/extension/chromium/filters/14.txt' },
  {
    id: 'adguard-spyware',
    name: 'AdGuard Spyware filter',
    url: 'https://github.com/AdguardTeam/AdguardFilters/tree/master/SpywareFilter/sections',
    urls: [
      'allowlist.txt', 'cookies_allowlist.txt', 'cookies_general.txt',
      'cookies_specific.txt', 'general_elemhide.txt', 'general_extensions.txt',
      'general_url.txt', 'mobile.txt', 'mobile_allowlist.txt', 'specific.txt',
      'tracking_servers.txt', 'tracking_servers_firstparty.txt',
    ].map((file) => `https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/SpywareFilter/sections/${file}`),
  },
  { id: 'russian', name: 'AdGuard Russian filter', url: 'https://filters.adtidy.org/extension/chromium/filters/1.txt' },
  { id: 'german', name: 'AdGuard German filter', url: 'https://filters.adtidy.org/extension/chromium/filters/6.txt' },
  { id: 'japanese', name: 'AdGuard Japanese filter', url: 'https://filters.adtidy.org/extension/chromium/filters/7.txt' },
  { id: 'dutch', name: 'AdGuard Dutch filter', url: 'https://filters.adtidy.org/extension/chromium/filters/8.txt' },
  { id: 'spanish', name: 'AdGuard Spanish/Portuguese filter', url: 'https://filters.adtidy.org/extension/chromium/filters/9.txt' },
  { id: 'turkish', name: 'AdGuard Turkish filter', url: 'https://filters.adtidy.org/extension/chromium/filters/13.txt' },
  { id: 'french', name: 'AdGuard French filter', url: 'https://filters.adtidy.org/extension/chromium/filters/16.txt' },
  { id: 'ukrainian', name: 'AdGuard Ukrainian filter', url: 'https://filters.adtidy.org/extension/chromium/filters/23.txt' },
  { id: 'italian', name: 'AdGuard Italian filter', url: 'https://filters.adtidy.org/extension/chromium/filters/26.txt' },
  { id: 'polish', name: 'AdGuard Polish filter', url: 'https://filters.adtidy.org/extension/chromium/filters/27.txt' },
  { id: 'chinese', name: 'AdGuard Chinese filter', url: 'https://filters.adtidy.org/extension/chromium/filters/224.txt' },
];

// --- filter list parsing ----------------------------------------------------
// Mirrors @privacy-shield/filter-parser and the collapse/removeparam parts of
// @privacy-shield/cosmetic-filter. Extensions ship plain JS, so this is a
// mirror, not an import.

// Auth/session parameters are never stripped. They look like tracking
// parameters to a filter list but removing them can break a login or an OAuth
// round-trip, so they are always kept.
const REMOVE_PARAM_DENYLIST = new Set([
  'code', 'state', 'token', 'access_token', 'id_token', 'refresh_token',
  'session', 'sessionid', 'session_id', 'auth', 'authorization',
  'password', 'passwd', 'otp', 'sig', 'signature', 'redirect_uri',
]);

const HOSTS_SINK_IPS = new Set(['0.0.0.0', '127.0.0.1', '::', '::1', '255.255.255.255']);
const HOSTNAME_PATTERN = /^(?:[a-z0-9_](?:[a-z0-9_-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const SAFE_DOMAIN_OPTIONS = new Set(['third-party', 'all', 'important', 'match-case']);

// Hosts-file entry -> sinkholed domains (`127.0.0.1 a.com b.com # note`).
function parseHostsLine(line) {
  if (!line || line.startsWith('#')) return [];
  const tokens = line.split(/\s+/);
  let candidate = tokens;
  if (tokens.length > 1) {
    const first = tokens[0];
    if (HOSTS_SINK_IPS.has(first)) candidate = tokens.slice(1);
    else if (!HOSTNAME_PATTERN.test(first)) return [];
  }
  const domains = [];
  for (const token of candidate) {
    if (token.startsWith('#')) break;
    if (!HOSTNAME_PATTERN.test(token)) return [];
    domains.push(token.toLowerCase());
  }
  return domains;
}

// Parses one list into the shapes the adapters need: block domains, cosmetic
// rules (specific / generic / exceptions) and removeparam rules.
function parseFilterList(text, options) {
  const config = options || {};
  const regexSupported = config.regexRemoveParams !== false;

  const result = {
    domains: new Set(),
    allowedDomains: new Set(),
    removeParams: new Set(),
    scopedRemoveParams: new Map(),
    regexRemoveParams: [],
    cosmeticSelectors: new Set(),
    cosmeticGeneric: new Set(),
    cosmeticExceptions: new Set(),
    strictDomains: new Set(),
    extendedRules: [],
    unsupportedRules: [],
    ruleCount: 0,
    unsupported: 0,
  };

  const addRemoveParam = (value, hostScope) => {
    const raw = (value || '').trim();
    if (!raw) return false;
    if (raw.length > 2 && raw.startsWith('/') && raw.endsWith('/')) {
      if (!regexSupported) return false;
      try {
        new RegExp(raw.slice(1, -1));
      } catch {
        return false;
      }
      if (!result.regexRemoveParams.includes(raw)) result.regexRemoveParams.push(raw);
      return true;
    }
    if (REMOVE_PARAM_DENYLIST.has(raw.toLowerCase())) return false;
    if (hostScope) {
      let set = result.scopedRemoveParams.get(hostScope);
      if (!set) {
        set = new Set();
        result.scopedRemoveParams.set(hostScope, set);
      }
      if (set.has(raw)) return false;
      set.add(raw);
      return true;
    }
    if (result.removeParams.has(raw)) return false;
    result.removeParams.add(raw);
    return true;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    // uBO section separators carry no rule; @@ network exceptions whitelist a
    // hostname (mirrors parseAllowRule() in @privacy-shield/filter-parser).
    if (line.startsWith('§') || line.startsWith('@@§')) continue;
    if (line.startsWith('@@')) {
      const body = line.slice(2).trim();
      if (!body.includes('$') && !body.includes('#')) {
        const m = /^(?:\|\|)?([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})\^?$/.exec(body);
        if (m && m[1]) {
          const domain = m[1].toLowerCase();
          if (!result.allowedDomains.has(domain)) {
            result.allowedDomains.add(domain);
            result.ruleCount += 1;
          }
        }
      }
      continue;
    }

    // Cosmetic classes: ## (specific/generic) and #@# (exception).
    const cosmetic = line.match(/^([^#]*?)#(@?)([?$%^]?)#(.+)$/);
    if (cosmetic) {
      const head = (cosmetic[1] || '').trim();
      const modifier = cosmetic[3] || '';
      const selector = (cosmetic[4] || '').trim();
      if (!selector || modifier) {
        result.unsupported += 1;
        continue;
      }
      if (cosmetic[2] === '@') result.cosmeticExceptions.add(`${head}##${selector}`);
      else if (head) result.cosmeticSelectors.add(`${head}##${selector}`);
      else result.cosmeticGeneric.add(`##${selector}`);
      result.ruleCount += 1;
      continue;
    }

    if (line.startsWith('#')) continue;

    // Hosts files: `127.0.0.1 ads.test`, `0.0.0.0 ads.test`, bare `ads.test`.
    const hosts = parseHostsLine(line);
    if (hosts.length) {
      for (const domain of hosts) {
        if (result.domains.has(domain)) continue;
        result.domains.add(domain);
        result.ruleCount += 1;
      }
      continue;
    }

    const dollar = line.indexOf('$');
    const pattern = dollar >= 0 ? line.slice(0, dollar).trim() : line;
    const listOptions = dollar >= 0 ? line.slice(dollar + 1).split(',') : [];

    let removeParam = null;
    let otherOption = false;
    const harmlessOptions = [];
    for (const option of listOptions) {
      const value = option.trim();
      if (!value) continue;
      if (value === 'removeparam') {
        removeParam = '';
        continue;
      }
      if (value.startsWith('removeparam=')) {
        removeParam = value.slice('removeparam='.length);
        continue;
      }
      harmlessOptions.push(value.toLowerCase());
      otherOption = true;
    }

    const domainMatch = /^\|\|([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\^$/i.exec(pattern);
    const scope = domainMatch ? (domainMatch[1] || '').toLowerCase() : '';

    // Extended options uBO supports. $csp/$removeheader are enforceable through
    // header modification; $replace/$redirect/$rename have no safe equivalent
    // in either browser API, so they are reported instead of silently dropped.
    const extended = [];
    const impossible = [];
    let strict = false;
    for (const option of listOptions) {
      const value = option.trim();
      const equals = value.indexOf('=');
      const name = (equals < 0 ? value : value.slice(0, equals)).toLowerCase();
      const optionValue = equals < 0 ? '' : value.slice(equals + 1).trim();
      if (name === 'csp' || name === 'removeheader') extended.push({ type: name, value: optionValue });
      if (name === 'replace' || name === 'redirect' || name === 'rename') impossible.push(name);
      if (name === 'document' || name === 'doc') strict = true;
    }
    if (strict && scope) {
      result.strictDomains.add(scope);
      result.ruleCount += 1;
      continue;
    }
    if (impossible.length || (extended.length && !scope)) {
      if (result.unsupportedRules.length < 30) {
        result.unsupportedRules.push({ line, options: impossible.length ? impossible : extended.map((e) => e.type) });
      }
      result.unsupported += 1;
      continue;
    }
    if (extended.length) {
      for (const rule of extended) {
        result.extendedRules.push({ domain: scope, type: rule.type, value: rule.value });
      }
      result.ruleCount += 1;
      continue;
    }

    if (removeParam !== null) {
      // A bare `$removeparam` removes every parameter; too destructive.
      const globalPattern = pattern === '' || pattern === '*';
      const regexParam = removeParam.length > 2 && removeParam.startsWith('/') && removeParam.endsWith('/');
      if (
        otherOption ||
        removeParam === '' ||
        (!scope && !globalPattern) ||
        (regexParam && !globalPattern) ||
        !addRemoveParam(removeParam, scope)
      ) {
        result.unsupported += 1;
        continue;
      }
      result.ruleCount += 1;
      continue;
    }

    const harmless = harmlessOptions.every((option) => SAFE_DOMAIN_OPTIONS.has(option));
    if (scope && (!otherOption || harmless)) {
      if (!result.domains.has(scope)) {
        result.domains.add(scope);
        result.ruleCount += 1;
      }
      continue;
    }

    result.unsupported += 1;
  }

  return result;
}

function compileRemoveParamRegex(list) {
  const compiled = [];
  for (const raw of list || []) {
    try {
      compiled.push(new RegExp(raw.slice(1, -1)));
    } catch {
      // Invalid regex in the list: ignore that rule.
    }
  }
  return compiled;
}
// --- end filter list parsing ------------------------------------------------

const AGG_FLAGS = {
  adguard_ext_chromium: true, adguard_ext_firefox: true,
  ext_chromium: true, ext_firefox: true, desktop: true,
  adguard_ext_chromium_mv3: false, adguard_ext_opera: false,
  adguard_ext_safari: false, adguard_ext_android_cb: false,
  adguard_app_windows: false, adguard_app_mac: false,
  adguard_app_android: false, adguard_app_ios: false,
  adguard_app_cli: false, ext_ublock: false,
};

function evaluateAggCondition(expression, flags = AGG_FLAGS) {
  const tokens = expression.trim().match(/&&|\|\||[()!]|[A-Za-z0-9_]+/g) || [];
  let position = 0;
  const peek = () => tokens[position];
  const parseOr = () => {
    let value = parseAnd();
    while (peek() === '||') { position += 1; value = value || parseAnd(); }
    return value;
  };
  const parseAnd = () => {
    let value = parseUnary();
    while (peek() === '&&') { position += 1; value = value && parseUnary(); }
    return value;
  };
  const parseUnary = () => {
    const token = tokens[position++];
    if (!token) return false;
    if (token === '!') return !parseUnary();
    if (token === '(') {
      const value = parseOr();
      if (peek() === ')') position += 1;
      return value;
    }
    return token !== '&&' && token !== '||' && token !== ')' && flags[token] === true;
  };
  return parseOr() === true;
}

function preprocessAggFilter(text) {
  const output = [];
  const stack = [];
  let active = true;
  let modifier = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('!#if')) {
      stack.push(active);
      active = active && evaluateAggCondition(line.slice(5));
      modifier = null;
      continue;
    }
    if (line.startsWith('!#endif')) {
      active = stack.length ? stack.pop() : true;
      modifier = null;
      continue;
    }
    if (line.startsWith('!+')) {
      const match = line.match(/PLATFORM\(([^)]*)\)/i);
      modifier = match
        ? { negate: /NOT_PLATFORM/i.test(line), platforms: match[1].split(',').map((name) => name.trim()).filter(Boolean) }
        : null;
      continue;
    }
    if (line.startsWith('!')) continue;
    if (!active) {
      modifier = null;
      continue;
    }
    if (modifier) {
      const listed = modifier.platforms.some((name) => AGG_FLAGS[name] === true);
      const applies = modifier.negate ? !listed : listed;
      modifier = null;
      if (!applies) continue;
    }
    output.push(line);
  }
  return output.join('\n');
}

let blockedDomains = new Set();
// Hosts whitelisted by @@ rules or the user's whitelist (uBO exception precedence).
let allowedDomains = new Set();
// $csp / $removeheader rules scoped to a request domain, and rules this
// engine cannot enforce (shown in the options page).
let extendedRules = [];
let unsupportedRules = [];
// --- dynamic filtering
// Per-site uBO-style firewall rules (allow / block / noop).
let dynamicRules = [];

function dynamicSuffixMatches(host, suffix) {
  return suffix === '*' || host === suffix || host.endsWith(`.${suffix}`);
}

// Mirrors resolveDynamicAction() in @privacy-shield/site-controls.
function resolveDynamicAction(hostname, target, type) {
  return dynamicRules
    .filter((rule) =>
      dynamicSuffixMatches(hostname.toLowerCase(), rule.hostname.toLowerCase()) &&
      dynamicSuffixMatches(target.toLowerCase(), rule.target.toLowerCase()) &&
      (rule.type === '*' || rule.type === type))
    .sort((a, b) => {
      const page = b.hostname.length - a.hostname.length;
      if (page) return page;
      const targetDelta = (b.target === '*' ? 0 : 1) - (a.target === '*' ? 0 : 1);
      if (targetDelta) return targetDelta;
      return (b.type === '*' ? 0 : 1) - (a.type === '*' ? 0 : 1);
    })[0]?.action ?? null;
}
// --- end dynamic filtering
let cosmeticSelectors = [];
let disabledSites = [];
let siteSettings = {};
let enabled = true;
let cookieProtection = true;
let scriptControl = false;
let antiBlockerDefusing = true;
let strictBlocking = true;
let strictDomains = new Set();

// $removeparam state. Firefox can rewrite a URL before it is sent, so the
// tracking parameters are removed here instead of only hidden in the UI.
let globalRemoveParams = new Set();
let scopedRemoveParams = new Map();
let regexRemoveParams = [];

// Action badge shown on the toolbar icon, so users see the per-tab blocked
// count without opening the popup (like uBlock Origin / Brave Shields).
const BADGE_BG = '#2dd4bf';
const BADGE_FG = '#062a27';
const action = browser.action || browser.browserAction;

let tabBlocked = new Map();
let tabSeen = new Map();
// Cosmetic hides are counted apart from blocks: hiding removes no request.
let tabHidden = new Map();
// Blocked URLs per tab, so the content script can collapse placeholder elements.
let tabBlockedUrls = new Map();
let pendingBlockedUrls = new Set();
let blockedUrlTimer = null;
// tabId -> Map(requestHost -> bitmask). Bit 1 = allowed, bit 2 = blocked.
// The popup derives "Domains connected" from these maps (uBO-style).
let tabDomains = new Map();
let pendingBadges = new Set();
let badgeTimer = null;

// Compact form of formatBadgeCount() from @privacy-shield/statistics.
// Extensions ship as plain JS, so the formatter is mirrored here.
function compactCount(count) {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 9.95) return `${(Math.round(k * 10) / 10).toString().replace(/\.0$/, '')}K`;
  if (k < 999.5) return `${Math.round(k)}K`;
  const m = n / 1000000;
  return `${(Math.round(m * 10) / 10).toString().replace(/\.0$/, '')}M`;
}

function noteDomain(tabId, requestHost, blocked) {
  if (typeof tabId !== 'number' || tabId < 0 || !requestHost) return;
  let map = tabDomains.get(tabId);
  if (!map) {
    map = new Map();
    tabDomains.set(tabId, map);
  }
  if (!map.has(requestHost) && map.size >= 500) return;
  map.set(requestHost, (map.get(requestHost) || 0) | (blocked ? 2 : 1));
}

// Records every observed request once and whether its domain was blocked.
// Allowed requests also count toward the page total so the popup can show
// an uBO-style percentage.
function noteRequest(tabId, requestHost, blocked) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  tabSeen.set(tabId, (tabSeen.get(tabId) || 0) + 1);
  noteDomain(tabId, requestHost, blocked);
}

function tabStats(tabId) {
  const map = tabDomains.get(tabId);
  let touched = 0;
  if (map) {
    for (const bits of map.values()) {
      if (bits & 2) touched += 1;
    }
  }
  return {
    count: tabBlocked.get(tabId) || 0,
    seen: tabSeen.get(tabId) || 0,
    hidden: tabHidden.get(tabId) || 0,
    domains: map ? map.size : 0,
    touched,
  };
}

function setBadge(tabId, text, title) {
  if (!action) return;
  try {
    action.setBadgeText({ tabId, text });
    if (title) action.setTitle({ tabId, title });
    if (text) {
      action.setBadgeBackgroundColor({ tabId, color: BADGE_BG });
      if (action.setBadgeTextColor) action.setBadgeTextColor({ tabId, color: BADGE_FG });
    }
  } catch {
    // The tab may have closed between the event and the render.
  }
}

async function updateBadge(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  let tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch {
    tabBlocked.delete(tabId);
    return;
  }
  const host = hostOf(tab && tab.url ? tab.url : '');
  const count = tabBlocked.get(tabId) || 0;
  if (!enabled || (host && isSiteDisabled(host))) {
    setBadge(tabId, '', 'Privacy Shield — protection paused on this site');
    return;
  }
  setBadge(
    tabId,
    count > 0 ? compactCount(count) : '',
    count > 0 ? `Privacy Shield — ${count.toLocaleString()} blocked on this page` : 'Privacy Shield',
  );
}

function scheduleBadge(tabId) {
  pendingBadges.add(tabId);
  if (!badgeTimer) badgeTimer = setTimeout(flushBadges, 120);
}

function flushBadges() {
  badgeTimer = null;
  const ids = Array.from(pendingBadges);
  pendingBadges.clear();
  for (const id of ids) updateBadge(id);
}

async function updateAllBadges() {
  try {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab && typeof tab.id === 'number') await updateBadge(tab.id);
    }
  } catch {
    // Tabs API unavailable; badges refresh on the next tab event.
  }
}

function resetTab(tabId) {
  tabBlocked.delete(tabId);
  tabSeen.delete(tabId);
  tabHidden.delete(tabId);
  tabBlockedUrls.delete(tabId);
  pendingBlockedUrls.delete(tabId);
  tabDomains.delete(tabId);
  pendingBadges.delete(tabId);
  setBadge(tabId, '', 'Privacy Shield');
}

function isBuiltinList(id) {
  return BUILTIN_LISTS.some((list) => list.id === id);
}

async function getLists() {
  const { customFilterLists = [] } = await browser.storage.local.get('customFilterLists');
  return [...BUILTIN_LISTS, ...customFilterLists];
}

// Mirrors prioritizeDomains() from @privacy-shield/filter-compiler. Firefox
// has no DNR quota, but keeping the rule set bounded avoids slow suffix walks.
const MAX_BLOCK_DOMAINS = 10000;
const PRIORITY_HINTS = [
  'doubleclick', 'googlesyndication', 'googleadservices', 'googletagmanager',
  'google-analytics', 'adnxs', 'casalemedia', 'criteo', 'taboola', 'outbrain',
];

function prioritizeDomains(domains, quota) {
  const score = (domain) => {
    for (let i = 0; i < PRIORITY_HINTS.length; i++) {
      if (domain.toLowerCase().includes(PRIORITY_HINTS[i])) return PRIORITY_HINTS.length - i;
    }
    return 0;
  };
  return Array.from(domains)
    .map((domain, index) => ({ domain, index, score: score(domain) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, quota)
    .map((entry) => entry.domain);
}

function isAllowedHost(host) {
  if (!host || !allowedDomains.size) return false;
  const parts = host.toLowerCase().split('.');
  for (let i = 0; i < parts.length; i++) {
    if (allowedDomains.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function isStrictHost(host) {
  if (!strictDomains.size || isAllowedHost(host)) return false;
  const parts = host.toLowerCase().split('.');
  for (let i = 0; i < parts.length; i++) {
    if (strictDomains.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

function isBlockedHost(host) {
  if (isAllowedHost(host)) return false;
  // Walk hostname suffixes for O(depth) lookup.
  const parts = host.split('.');
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.slice(i).join('.');
    if (blockedDomains.has(suffix)) return true;
  }
  return false;
}

function sameSite(a, b) {
  const ra = a.split('.').slice(-2).join('.');
  const rb = b.split('.').slice(-2).join('.');
  return ra === rb;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function initiatorHostOf(details) {
  return hostOf(details.originUrl || details.documentUrl || '');
}

// Resolves a module setting for a site, falling back to the global default.
function settingFor(host, key, fallback) {
  const site = siteSettings[host];
  if (site && typeof site[key] === 'boolean') return site[key];
  return fallback;
}

function isSiteDisabled(host) {
  if (disabledSites.includes(host)) return true;
  const site = siteSettings[host];
  return !!site && site.enabled === false;
}

async function refreshState(keys) {
  const st = await browser.storage.local.get([
    'enabled', 'disabledSites', 'siteSettings', 'cosmeticSelectors', 'cookieProtection', 'scriptControl', 'dynamicRules', 'antiBlockerDefusing', 'strictBlocking',
  ]);
  if (!keys || keys.includes('enabled')) enabled = st.enabled !== false;
  if (!keys || keys.includes('disabledSites')) disabledSites = st.disabledSites || [];
  if (!keys || keys.includes('siteSettings')) siteSettings = st.siteSettings || {};
  if (!keys || keys.includes('cosmeticSelectors')) cosmeticSelectors = st.cosmeticSelectors || [];
  if (!keys || keys.includes('cookieProtection')) cookieProtection = st.cookieProtection !== false;
  if (!keys || keys.includes('scriptControl')) scriptControl = st.scriptControl === true;
  if (!keys || keys.includes('dynamicRules')) {
    dynamicRules = Array.isArray(st.dynamicRules) ? st.dynamicRules : [];
  }
  if (!keys || keys.includes('antiBlockerDefusing')) antiBlockerDefusing = st.antiBlockerDefusing !== false;
  if (!keys || keys.includes('strictBlocking')) strictBlocking = st.strictBlocking !== false;
  if (!keys || keys.includes('strictDomains')) strictDomains = new Set(st.strictDomains || []);
}

async function fetchLists() {
  const selectors = new Set();
  const generic = new Set();
  const exceptions = new Set();
  const domains = new Set();
  const params = new Set();
  const scoped = new Map();
  const regexParams = [];
  const extended = new Map();
  const unsupported = [];
  const strict = new Set();
  const status = {};
  const { filterLists = { easylist: true, easyprivacy: true }, customRulesText = '', whitelist = [] } =
    await browser.storage.local.get(['filterLists', 'customRulesText', 'whitelist']);
  const allowed = new Set(Array.isArray(whitelist) ? whitelist.map((d) => String(d).toLowerCase()).filter(Boolean) : []);

  const lists = await getLists();
  for (const list of lists) {
    const defaultEnabled = ['easylist', 'easyprivacy', 'privacy-removeparam', 'peter-lowe-blocklist', 'annoyances', 'adguard-spyware'];
    const listEnabled = isBuiltinList(list.id)
      ? filterLists[list.id] === undefined
        ? defaultEnabled.includes(list.id)
        : filterLists[list.id] !== false
      : list.enabled !== false;
    status[list.id] = {
      id: list.id,
      name: list.name || list.url,
      url: list.url,
      enabled: listEnabled,
      updatedAt: list.updatedAt || null,
      ruleCount: 0,
      error: null,
    };
    if (!listEnabled) continue;

    try {
      const sources = Array.isArray(list.urls) && list.urls.length ? list.urls : [list.url];
      const texts = await Promise.all(sources.map(async (url) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (/brotli-encoded/i.test(text)) {
            throw new Error('List server requires brotli; the browser did not negotiate it');
          }
          return text;
        } finally {
          clearTimeout(timeout);
        }
      }));
      const text = preprocessAggFilter(texts.join('\n'));
      const parsed = parseFilterList(text);
      for (const domain of parsed.domains) domains.add(domain);
      for (const domain of parsed.allowedDomains) allowed.add(domain);
      for (const domain of parsed.strictDomains) strict.add(domain);
      for (const selector of parsed.cosmeticSelectors) selectors.add(selector);
      for (const selector of parsed.cosmeticGeneric) generic.add(selector);
      for (const selector of parsed.cosmeticExceptions) exceptions.add(selector);
      for (const param of parsed.removeParams) params.add(param);
      for (const [host, list] of parsed.scopedRemoveParams) {
        let set = scoped.get(host);
        if (!set) {
          set = new Set();
          scoped.set(host, set);
        }
        for (const param of list) set.add(param);
      }
      for (const entry of parsed.regexRemoveParams) {
        if (!regexParams.includes(entry)) regexParams.push(entry);
      }
      for (const rule of parsed.extendedRules) {
        extended.set(`${rule.domain}|${rule.type}|${rule.value}`, rule);
      }
      for (const rule of parsed.unsupportedRules) {
        if (unsupported.length < 50) unsupported.push({ ...rule, list: list.id });
      }
      status[list.id].updatedAt = Date.now();
      // Counts every rule the list contributes (block domains, cosmetic rules,
      // removeparam), not just `||domain^` lines.
      status[list.id].ruleCount = parsed.ruleCount;
    } catch (e) {
      status[list.id].error = String((e && e.message) || e);
      console.warn('List fetch failed', list.url, e);
    }
  }

  for (const raw of customRulesText.split(/\r?\n/)) {
    const line = raw.trim();
    const options = line.includes('$') ? line.slice(line.indexOf('$') + 1).split(',') : [];
    const hasRemoveParam = options.some((option) => /^removeparam(?:=|$)/i.test(option.trim()));
    const dm = line.match(/^\|\|([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})\^/);
    if (dm && !hasRemoveParam) domains.add(dm[1].toLowerCase());
    const parsed = parseFilterList(line);
    for (const domain of parsed.allowedDomains) allowed.add(domain);
    for (const domain of parsed.strictDomains) strict.add(domain);
    for (const domain of parsed.domains) domains.add(domain);
    for (const param of parsed.removeParams) params.add(param);
    for (const [host, list] of parsed.scopedRemoveParams) {
      let set = scoped.get(host);
      if (!set) {
        set = new Set();
        scoped.set(host, set);
      }
      for (const param of list) set.add(param);
    }
    for (const entry of parsed.regexRemoveParams) {
      if (!regexParams.includes(entry)) regexParams.push(entry);
    }
    for (const rule of parsed.extendedRules) {
      extended.set(`${rule.domain}|${rule.type}|${rule.value}`, rule);
    }
    for (const rule of parsed.unsupportedRules) {
      if (unsupported.length < 50) unsupported.push({ ...rule, list: 'custom' });
    }
  }

  extendedRules = Array.from(extended.values());
  unsupportedRules = unsupported;
  strictDomains = strict;
  allowedDomains = allowed;
  const rankedDomains = prioritizeDomains(domains, MAX_BLOCK_DOMAINS);
  blockedDomains = new Set(rankedDomains.filter((domain) => !isAllowedHost(domain)));
  cosmeticSelectors = Array.from(selectors);
  globalRemoveParams = params;
  scopedRemoveParams = scoped;
  regexRemoveParams = compileRemoveParamRegex(regexParams);
  await browser.storage.local.set({
    cosmeticSelectors,
    cosmeticGeneric: Array.from(generic),
    cosmeticExceptions: Array.from(exceptions),
    filterListStatus: status,
    activeRuleCount: domains.size,
    activeRemoveParamCount: params.size,
    extendedRules,
    unsupportedRules,
    strictDomains: Array.from(strict),
  });
  await refreshState();
}

// Batch counters so a burst of blocked requests does not race on storage writes.
let pendingBlocked = 0;
let pendingSites = {};
let pendingHidden = 0;
let pendingLog = [];
let flushTimer = null;

const MAX_BLOCKED_URLS = 60;

function noteBlockedUrl(tabId, url) {
  if (typeof tabId !== 'number' || tabId < 0 || typeof url !== 'string' || url === '') return;
  let urls = tabBlockedUrls.get(tabId);
  if (!urls) {
    urls = [];
    tabBlockedUrls.set(tabId, urls);
  }
  if (urls.includes(url)) return;
  if (urls.length >= MAX_BLOCKED_URLS) urls.shift();
  urls.push(url);
  pendingBlockedUrls.add(tabId);
  if (!blockedUrlTimer) blockedUrlTimer = setTimeout(flushBlockedUrls, 500);
}

async function flushBlockedUrls() {
  blockedUrlTimer = null;
  const tabIds = Array.from(pendingBlockedUrls);
  pendingBlockedUrls.clear();
  for (const tabId of tabIds) {
    const urls = tabBlockedUrls.get(tabId) || [];
    if (!urls.length) continue;
    try {
      await browser.tabs.sendMessage(tabId, { type: 'blockedResources', urls: urls.slice() });
    } catch {
      // No content script in this frame (PDF viewer, error page, ...).
    }
  }
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flushStats, 400);
}

// Cosmetic hides are tracked separately from blocks: they remove no request.
function noteHidden(tabId, count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return;
  if (typeof tabId === 'number' && tabId >= 0) {
    tabHidden.set(tabId, (tabHidden.get(tabId) || 0) + n);
  }
  pendingHidden += n;
  scheduleFlush();
}

function recordBlocked(url, initiatorHost, tabId, detail) {
  const info = detail || {};
  pendingBlocked += 1;
  if (initiatorHost) pendingSites[initiatorHost] = (pendingSites[initiatorHost] || 0) + 1;
  pendingLog.push({
    url,
    time: Date.now(),
    site: initiatorHost || null,
    reason: info.reason || 'block',
    rule: typeof info.rule === 'string' ? info.rule.slice(0, 300) : null,
    type: info.type || null,
  });
  if (pendingLog.length > 200) pendingLog = pendingLog.slice(-200);
  if (typeof tabId === 'number' && tabId >= 0) {
    tabBlocked.set(tabId, (tabBlocked.get(tabId) || 0) + 1);
    noteBlockedUrl(tabId, url);
    scheduleBadge(tabId);
  }
  scheduleFlush();
}

async function flushStats() {
  flushTimer = null;
  const blockedInc = pendingBlocked;
  const siteInc = pendingSites;
  const hiddenInc = pendingHidden;
  const logs = pendingLog;
  pendingBlocked = 0;
  pendingSites = {};
  pendingHidden = 0;
  pendingLog = [];
  if (!blockedInc && !hiddenInc && !logs.length) return;

  if (hiddenInc) {
    const { cosmeticHidden = 0 } = await browser.storage.local.get('cosmeticHidden');
    await browser.storage.local.set({ cosmeticHidden: cosmeticHidden + hiddenInc });
  }

  if (blockedInc || logs.length) {
    const { blocked = 0, siteStats = {}, requestLog = [] } =
      await browser.storage.local.get(['blocked', 'siteStats', 'requestLog']);
    const nextSites = { ...siteStats };
    for (const [host, count] of Object.entries(siteInc)) {
      nextSites[host] = (nextSites[host] || 0) + count;
    }
    const nextLog = [...logs.reverse(), ...requestLog].slice(0, 200);
    await browser.storage.local.set({
      blocked: blocked + blockedInc,
      siteStats: nextSites,
      requestLog: nextLog,
    });
  }
}

// Mirrors resolveWebRtcPolicy() from @privacy-shield/privacy.
async function applyWebRtcProtection(enabled) {
  const network = browser.privacy && browser.privacy.network;
  const policy = network && network.webRTCIPHandlingPolicy;
  if (!policy || !policy.set) return;
  try {
    await policy.set({ value: enabled === true ? 'relay' : 'default' });
  } catch {
    // Managed profiles can reject the change.
  }
}

browser.runtime.onStartup.addListener(async () => {
  const { webRtcProtection = false } = await browser.storage.local.get('webRtcProtection');
  await applyWebRtcProtection(webRtcProtection);
  await fetchLists();
  await updateAllBadges();
});

browser.runtime.onInstalled.addListener(async () => {
  const st = await browser.storage.local.get('enabled');
  if (st.enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0, disabledSites: [], siteSettings: {}, customFilterLists: [] });
  }
  const { webRtcProtection = false } = await browser.storage.local.get('webRtcProtection');
  await applyWebRtcProtection(webRtcProtection);
  await fetchLists();
  await updateAllBadges();
  console.log('Privacy Shield (Firefox) installed.');
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.webRtcProtection) applyWebRtcProtection(changes.webRtcProtection.newValue === true);
  if (changes.filterLists || changes.customFilterLists || changes.customRulesText || changes.whitelist) {
    fetchLists().then(updateAllBadges);
    return;
  }
  const relevant = Object.keys(changes).filter((k) =>
    ['enabled', 'disabledSites', 'siteSettings', 'cosmeticSelectors', 'cookieProtection', 'scriptControl', 'dynamicRules', 'webRtcProtection', 'antiBlockerDefusing', 'strictBlocking'].includes(k)
  );
  if (relevant.length) {
    refreshState(relevant).then(updateAllBadges);
  }
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'contextTargetReady') {
    // The content script saw a right-click: remember which frame holds the
    // element so the menu click can be routed to that frame.
    const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : -1;
    if (tabId >= 0) {
      const frameId = sender && typeof sender.frameId === 'number' ? sender.frameId : 0;
      contextTargets.set(tabId, { frameId, at: Date.now() });
    }
    return undefined;
  }
  if (msg && msg.type === 'cosmeticStats') {
    const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : -1;
    noteHidden(tabId, msg.hidden);
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === 'getTabStats') {
    const tabId = typeof msg.tabId === 'number' ? msg.tabId : sender && sender.tab ? sender.tab.id : -1;
    sendResponse(tabStats(tabId));
    return true;
  }
  if (msg && msg.type === 'refreshLists') {
    fetchLists().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// --- context menu: block element --------------------------------------------
// The browser context menu offers "Privacy Shield → Block element", the same
// entry uBlock Origin and AdGuard show. The browser does not report the
// pointer position for a menu click, so the content script remembers the
// element the user right-clicked and reports the frame it lives in.

const CONTEXT_MENU_ROOT = 'privacy-shield-root';
const CONTEXT_MENU_BLOCK = 'privacy-shield-block-element';
const CONTEXT_MENU_PATTERNS = ['http://*/*', 'https://*/*'];
// tabId -> { frameId, at } of the frame that last saw a right-click.
const contextTargets = new Map();

let contextMenusPromise = null;

// Creates the menu item or, when it already exists, refreshes its title.
// Reloading the add-on drops the items, so "create if missing" is the
// default path.
async function upsertContextMenu(properties) {
  try {
    await browser.menus.update(properties.id, { title: properties.title });
  } catch {
    await browser.menus.create(properties);
  }
}

function ensureContextMenus() {
  if (!browser.menus) return Promise.resolve();
  if (!contextMenusPromise) {
    contextMenusPromise = (async () => {
      try {
        await upsertContextMenu({
          id: CONTEXT_MENU_ROOT,
          title: 'Privacy Shield',
          contexts: ['all'],
          documentUrlPatterns: CONTEXT_MENU_PATTERNS,
        });
        await upsertContextMenu({
          id: CONTEXT_MENU_BLOCK,
          parentId: CONTEXT_MENU_ROOT,
          title: 'Block element',
          contexts: ['all'],
        });
      } catch (e) {
        console.warn('Context menu setup failed', e);
      }
    })();
  }
  return contextMenusPromise;
}

// Asks the frame that saw the right-click to block that element. When that
// frame is gone the element picker takes over so the user can still choose.
async function requestBlockElement(tabId) {
  const target = contextTargets.get(tabId);
  const message = { type: 'blockElement' };
  if (target && typeof target.frameId === 'number') {
    try {
      const res = await browser.tabs.sendMessage(tabId, message, { frameId: target.frameId });
      if (res && res.ok) return true;
      if (res && res.reason === 'disabled') return false;
    } catch {
      // The frame is gone (navigation or reload).
    }
  }
  try {
    await browser.tabs.sendMessage(tabId, { type: 'startPicker' }, { frameId: 0 });
  } catch {
    // The page has no content script at all.
  }
  return false;
}

if (browser.menus && browser.menus.onClicked) {
  browser.menus.onClicked.addListener((info, tab) => {
    if (!info || info.menuItemId !== CONTEXT_MENU_BLOCK) return;
    if (!tab || typeof tab.id !== 'number') return;
    requestBlockElement(tab.id);
  });
}

ensureContextMenus();

browser.tabs.onActivated.addListener(({ tabId }) => scheduleBadge(tabId));

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // A new document starts with a clean per-page counter.
  if (changeInfo.status === 'loading' || changeInfo.url) {
    resetTab(tabId);
    return;
  }
  if (changeInfo.status === 'complete') scheduleBadge(tabId);
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabBlocked.delete(tabId);
  tabSeen.delete(tabId);
  tabHidden.delete(tabId);
  tabBlockedUrls.delete(tabId);
  pendingBlockedUrls.delete(tabId);
  tabDomains.delete(tabId);
  pendingBadges.delete(tabId);
  contextTargets.delete(tabId);
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!enabled) return {};
    const host = hostOf(details.url);
    if (!host) return {};
    const initiatorHost = initiatorHostOf(details);
    if (initiatorHost && isSiteDisabled(initiatorHost)) return {};

    // Strict blocking ($document) cancels the whole page navigation.
    if (details.type === 'main_frame' && strictBlocking && isStrictHost(host)) {
      recordBlocked(details.url, initiatorHost, details.tabId, { reason: 'strict', type: details.type });
      return { cancel: true };
    }

    // Anti-blocker defusing: block the page's own detection script. Mirrors
    // isAntiAdblockScript() in @privacy-shield/cosmetic-filter.
    if (
      antiBlockerDefusing && details.type === 'script' && initiatorHost &&
      !isSiteDisabled(initiatorHost) &&
      /blockadblock|anti-adblock|anti_adblock|adblock-detector/i.test(details.url)
    ) {
      recordBlocked(details.url, initiatorHost, details.tabId, { reason: 'anti-adblock', type: details.type });
      return { cancel: true };
    }

    // Top-level navigations are never blocked, but their query string can still
    // be cleaned below.
    if (details.type !== 'main_frame') {
      // Only block third-party requests so first-party site resources always load.
      const thirdParty = !!initiatorHost && !sameSite(initiatorHost, host);
      const dynamic = initiatorHost ? resolveDynamicAction(initiatorHost, host, details.type) : null;
      const passthrough = dynamic === 'allow' || dynamic === 'noop';
      const blocked = dynamic === 'block' ||
        (thirdParty && !passthrough &&
          ((settingFor(initiatorHost, 'scriptControl', scriptControl) && details.type === 'script' && !isAllowedHost(host)) ||
            isBlockedHost(host)));
      noteRequest(details.tabId, host, blocked);
      if (blocked) {
        recordBlocked(details.url, initiatorHost, details.tabId, {
          reason: dynamic === 'block' ? 'strict' : 'block',
          rule: dynamic === 'block' ? `dynamic:${dynamic}` : null,
          type: details.type,
        });
        return { cancel: true };
      }
    }

    // A block always wins: removeparam only runs for requests that were allowed.
    if (details.method === 'GET' && TRACKING_REDIRECT_TYPES.has(details.type)) {
      const rewritten = stripTrackingParams(details.url, host);
      if (rewritten && rewritten !== details.url) return { redirectUrl: rewritten };
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// Resource types whose query string is rewritten: navigations and fetch/XHR.
// Redirecting images/scripts buys nothing and costs a round trip.
const TRACKING_REDIRECT_TYPES = new Set(['main_frame', 'sub_frame', 'xmlhttprequest']);

// uBO's `$removeparam`: rewrite the URL so the tracking parameters never reach
// the site. Auth/session parameters are denylisted at parse time, so a login or
// OAuth round-trip is never broken by a list that thinks `token` is tracking.
// Mirrors applyRemoveParams() in @privacy-shield/network-filter; Firefox can
// enforce regex rules directly through webRequest (Chromium needs a content
// script fallback because DNR cannot express regex query transforms).
function stripTrackingParams(url, host) {
  if (!globalRemoveParams.size && !scopedRemoveParams.size && !regexRemoveParams.length) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.search) return null;

  const scoped = new Set();
  const hostParts = host.split('.');
  for (let i = 0; i < hostParts.length; i++) {
    const hostParams = scopedRemoveParams.get(hostParts.slice(i).join('.'));
    if (hostParams) {
      for (const name of hostParams) scoped.add(name);
    }
  }
  const drop = [];
  const seen = new Set();
  for (const name of parsed.searchParams.keys()) {
    if (seen.has(name)) continue;
    seen.add(name);
    const lower = name.toLowerCase();
    if (REMOVE_PARAM_DENYLIST.has(lower)) continue;
    if (globalRemoveParams.has(name) || globalRemoveParams.has(lower)) {
      drop.push(name);
      continue;
    }
    if (scoped.has(name) || scoped.has(lower)) {
      drop.push(name);
      continue;
    }
    for (const pattern of regexRemoveParams) {
      if (pattern.test(name)) {
        drop.push(name);
        break;
      }
    }
  }
  if (!drop.length) return null;
  for (const name of drop) parsed.searchParams.delete(name);
  return parsed.href;
}

function isThirdParty(details) {
  const host = hostOf(details.url);
  const initiatorHost = initiatorHostOf(details);
  if (!host || !initiatorHost) return false;
  return !sameSite(initiatorHost, host);
}

// Top-level navigations must keep their cookies. Firefox reports the referring
// page as `originUrl` for main_frame requests, so a normal click from another
// site looks third-party; stripping Cookie there logged users out of the
// destination site (until a reload) and stripping Set-Cookie dropped the
// session cookie from login responses. Mirrors COOKIE_GUARD_RESOURCE_TYPES in
// @privacy-shield/network-filter.
function isCookieGuarded(details) {
  return details.type !== 'main_frame';
}

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!enabled || !isCookieGuarded(details) || !isThirdParty(details)) return {};
    const initiatorHost = initiatorHostOf(details);
    if (isSiteDisabled(initiatorHost)) return {};
    if (!settingFor(initiatorHost, 'cookieProtection', cookieProtection)) return {};
    const headers = details.requestHeaders.filter((h) => h.name.toLowerCase() !== 'cookie');
    return { requestHeaders: headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);

function hostMatchesSuffix(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function applyExtendedHeaders(headers, host) {
  if (!extendedRules.length) return headers;
  let next = headers;
  for (const rule of extendedRules) {
    if (!hostMatchesSuffix(host, rule.domain)) continue;
    const value = String(rule.value || '').trim();
    if (!value || value.length > 600 || /[\r\n\0]/.test(value)) continue;
    if (rule.type === 'csp') {
      next = [...next, { name: 'Content-Security-Policy', value }];
    } else {
      const name = value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
      if (name) next = next.filter((h) => h.name.toLowerCase() !== name);
    }
  }
  return next;
}

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!enabled) return {};
    const host = hostOf(details.url);
    if (!host) return {};
    let headers = details.responseHeaders || [];
    const initiatorHost = initiatorHostOf(details);
    if (
      isCookieGuarded(details) && isThirdParty(details) && !isSiteDisabled(initiatorHost) &&
      settingFor(initiatorHost, 'cookieProtection', cookieProtection)
    ) {
      headers = headers.filter((h) => h.name.toLowerCase() !== 'set-cookie');
    }
    if (isAllowedHost(host)) return { responseHeaders: headers };
    headers = applyExtendedHeaders(headers, host);
    return { responseHeaders: headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'responseHeaders']
);
