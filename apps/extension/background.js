const BUILTIN_LISTS = [
  { id: 'easylist', name: 'EasyList', url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', name: 'EasyPrivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
];

let blockedDomains = new Set();
let cosmeticSelectors = [];
let disabledSites = [];
let siteSettings = {};
let enabled = true;
let cookieProtection = true;
let scriptControl = false;

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
  });
  await refreshState();
}

browser.runtime.onStartup.addListener(async () => { await fetchLists(); });

browser.runtime.onInstalled.addListener(async () => {
  const st = await browser.storage.local.get('enabled');
  if (st.enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0, disabledSites: [], siteSettings: {}, customFilterLists: [] });
  }
  await fetchLists();
  console.log('Privacy Shield (Firefox) installed.');
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.filterLists || changes.customFilterLists || changes.customRulesText) {
    fetchLists();
    return;
  }
  const relevant = Object.keys(changes).filter((k) =>
    ['enabled', 'disabledSites', 'siteSettings', 'cosmeticSelectors', 'cookieProtection', 'scriptControl'].includes(k)
  );
  if (relevant.length) refreshState(relevant);
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'refreshLists') {
    fetchLists().then(() => sendResponse({ ok: true }));
    return true;
  }
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
      return { cancel: true };
    }
    if (isBlockedHost(host)) {
      browser.storage.local.get(['blocked', 'requestLog']).then(({ blocked = 0, requestLog = [] }) => {
        requestLog.unshift({ url: details.url, time: Date.now() });
        browser.storage.local.set({ blocked: blocked + 1, requestLog: requestLog.slice(0, 200) });
      });
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
