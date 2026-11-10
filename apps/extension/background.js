const BUILTIN_LISTS = [
  { id: 'easylist', name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { id: 'privacy-removeparam', name: 'AdGuard/uBO URL Tracking Protection', url: 'https://services.helium.imput.net/ubo/adguard-spyware-url/93b535a2/55a42892/privacy-removeparam.txt' },
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

let blockedDomains = new Set();
let cosmeticSelectors = [];
let disabledSites = [];
let siteSettings = {};
let enabled = true;
let cookieProtection = true;
let scriptControl = false;

// Action badge shown on the toolbar icon, so users see the per-tab blocked
// count without opening the popup (like uBlock Origin / Brave Shields).
const BADGE_BG = '#2dd4bf';
const BADGE_FG = '#062a27';
const action = browser.action || browser.browserAction;

let tabBlocked = new Map();
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

function isBlockedHost(host) {
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
    'enabled', 'disabledSites', 'siteSettings', 'cosmeticSelectors', 'cookieProtection', 'scriptControl',
  ]);
  if (!keys || keys.includes('enabled')) enabled = st.enabled !== false;
  if (!keys || keys.includes('disabledSites')) disabledSites = st.disabledSites || [];
  if (!keys || keys.includes('siteSettings')) siteSettings = st.siteSettings || {};
  if (!keys || keys.includes('cosmeticSelectors')) cosmeticSelectors = st.cosmeticSelectors || [];
  if (!keys || keys.includes('cookieProtection')) cookieProtection = st.cookieProtection !== false;
  if (!keys || keys.includes('scriptControl')) scriptControl = st.scriptControl === true;
}

async function fetchLists() {
  const selectors = new Set();
  const domains = new Set();
  const status = {};
  const { filterLists = { easylist: true, easyprivacy: true }, customRulesText = '' } =
    await browser.storage.local.get(['filterLists', 'customRulesText']);

  const lists = await getLists();
  for (const list of lists) {
    const listEnabled = isBuiltinList(list.id) ? filterLists[list.id] !== false : list.enabled !== false;
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

    let ruleCount = 0;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(list.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('@@')) continue;
        if (line.includes('$')) continue;
        const dm = line.match(/^\|\|([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})\^/);
        if (dm) {
          domains.add(dm[1]);
          ruleCount++;
        }
        // Only keep site-specific cosmetic rules; generic rules can hide whole pages.
        const cm = line.match(/^([a-zA-Z0-9.*-]+)##(.+)$/);
        if (cm && cm[1] && cm[1] !== '*' && cm[2]) selectors.add(`${cm[1]}##${cm[2]}`);
      }
      status[list.id].updatedAt = Date.now();
      status[list.id].ruleCount = ruleCount;
    } catch (e) {
      status[list.id].error = String((e && e.message) || e);
      console.warn('List fetch failed', list.url, e);
    }
  }

  for (const raw of customRulesText.split(/\r?\n/)) {
    const line = raw.trim();
    const dm = line.match(/^\|\|([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})\^/);
    if (dm) domains.add(dm[1]);
  }

  blockedDomains = domains;
  cosmeticSelectors = Array.from(selectors);
  await browser.storage.local.set({
    cosmeticSelectors,
    filterListStatus: status,
    activeRuleCount: domains.size,
  });
  await refreshState();
}

// Batch counters so a burst of blocked requests does not race on storage writes.
let pendingBlocked = 0;
let pendingSites = {};
let pendingLog = [];
let flushTimer = null;

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flushStats, 400);
}

function recordBlocked(url, initiatorHost, tabId) {
  pendingBlocked += 1;
  if (initiatorHost) pendingSites[initiatorHost] = (pendingSites[initiatorHost] || 0) + 1;
  pendingLog.push({ url, time: Date.now(), site: initiatorHost || null });
  if (pendingLog.length > 200) pendingLog = pendingLog.slice(-200);
  if (typeof tabId === 'number' && tabId >= 0) {
    tabBlocked.set(tabId, (tabBlocked.get(tabId) || 0) + 1);
    scheduleBadge(tabId);
  }
  scheduleFlush();
}

async function flushStats() {
  flushTimer = null;
  const blockedInc = pendingBlocked;
  const siteInc = pendingSites;
  const logs = pendingLog;
  pendingBlocked = 0;
  pendingSites = {};
  pendingLog = [];
  if (!blockedInc && !logs.length) return;

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

browser.runtime.onStartup.addListener(async () => { await fetchLists(); await updateAllBadges(); });

browser.runtime.onInstalled.addListener(async () => {
  const st = await browser.storage.local.get('enabled');
  if (st.enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0, disabledSites: [], siteSettings: {}, customFilterLists: [] });
  }
  await fetchLists();
  await updateAllBadges();
  console.log('Privacy Shield (Firefox) installed.');
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.filterLists || changes.customFilterLists || changes.customRulesText) {
    fetchLists().then(updateAllBadges);
    return;
  }
  const relevant = Object.keys(changes).filter((k) =>
    ['enabled', 'disabledSites', 'siteSettings', 'cosmeticSelectors', 'cookieProtection', 'scriptControl'].includes(k)
  );
  if (relevant.length) {
    refreshState(relevant).then(updateAllBadges);
  }
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'getTabStats') {
    const tabId = typeof msg.tabId === 'number' ? msg.tabId : sender && sender.tab ? sender.tab.id : -1;
    sendResponse({ count: tabBlocked.get(tabId) || 0 });
    return true;
  }
  if (msg && msg.type === 'refreshLists') {
    fetchLists().then(() => sendResponse({ ok: true }));
    return true;
  }
});

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
  pendingBadges.delete(tabId);
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!enabled) return {};
    if (details.type === 'main_frame') return {};
    const host = hostOf(details.url);
    if (!host) return {};
    const initiatorHost = initiatorHostOf(details);
    if (initiatorHost && isSiteDisabled(initiatorHost)) return {};
    // Only block third-party requests so first-party site resources always load.
    if (!initiatorHost) return {};
    if (sameSite(initiatorHost, host)) return {};
    if (settingFor(initiatorHost, 'scriptControl', scriptControl) && details.type === 'script') {
      recordBlocked(details.url, initiatorHost, details.tabId);
      return { cancel: true };
    }
    if (isBlockedHost(host)) {
      recordBlocked(details.url, initiatorHost, details.tabId);
      return { cancel: true };
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

function isThirdParty(details) {
  const host = hostOf(details.url);
  const initiatorHost = initiatorHostOf(details);
  if (!host || !initiatorHost) return false;
  return !sameSite(initiatorHost, host);
}

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!enabled || !isThirdParty(details)) return {};
    const initiatorHost = initiatorHostOf(details);
    if (isSiteDisabled(initiatorHost)) return {};
    if (!settingFor(initiatorHost, 'cookieProtection', cookieProtection)) return {};
    const headers = details.requestHeaders.filter((h) => h.name.toLowerCase() !== 'cookie');
    return { requestHeaders: headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!enabled || !isThirdParty(details)) return {};
    const initiatorHost = initiatorHostOf(details);
    if (isSiteDisabled(initiatorHost)) return {};
    if (!settingFor(initiatorHost, 'cookieProtection', cookieProtection)) return {};
    const headers = (details.responseHeaders || []).filter((h) => h.name.toLowerCase() !== 'set-cookie');
    return { responseHeaders: headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'responseHeaders']
);
