const LISTS = [
  { id: 'easylist', url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
];

let blockedDomains = new Set();
let cosmeticSelectors = [];
let disabledSites = [];
let enabled = true;

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

async function refreshState(keys) {
  const st = await browser.storage.local.get(['enabled', 'disabledSites', 'cosmeticSelectors']);
  if (!keys || keys.includes('enabled')) enabled = st.enabled !== false;
  if (!keys || keys.includes('disabledSites')) disabledSites = st.disabledSites || [];
  if (!keys || keys.includes('cosmeticSelectors')) cosmeticSelectors = st.cosmeticSelectors || [];
}

async function fetchLists() {
  const selectors = new Set();
  const domains = new Set();
  const { filterLists = { easylist: true, easyprivacy: true }, customRulesText = '' } =
    await browser.storage.local.get(['filterLists', 'customRulesText']);
  for (const list of LISTS) {
    if (filterLists[list.id] === false) continue;
    const url = list.url;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const text = await res.text();
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('@@')) continue;
        if (line.includes('$')) continue;
        const dm = line.match(/^\|\|([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})\^/);
        if (dm) domains.add(dm[1]);
        // Only keep site-specific cosmetic rules; generic rules can hide whole pages.
        const cm = line.match(/^([a-zA-Z0-9.*-]+)##(.+)$/);
        if (cm && cm[1] && cm[1] !== '*' && cm[2]) selectors.add(`${cm[1]}##${cm[2]}`);
      }
    } catch (e) {
      console.warn('List fetch failed', url, e);
    }
  }
  for (const raw of customRulesText.split(/\r?\n/)) {
    const line = raw.trim();
    const dm = line.match(/^\|\|([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})\^/);
    if (dm) domains.add(dm[1]);
  }
  blockedDomains = domains;
  await browser.storage.local.set({ cosmeticSelectors: Array.from(selectors) });
  await refreshState();
}

browser.runtime.onStartup.addListener(async () => { await fetchLists(); });

browser.runtime.onInstalled.addListener(async () => {
  const st = await browser.storage.local.get('enabled');
  if (st.enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0, disabledSites: [] });
  }
  await fetchLists();
  console.log('Privacy Shield (Firefox) installed.');
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.filterLists || changes.customRulesText) {
    fetchLists();
    return;
  }
  const relevant = Object.keys(changes).filter((k) => ['enabled', 'disabledSites', 'cosmeticSelectors'].includes(k));
  if (relevant.length) refreshState(relevant);
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!enabled) return {};
    if (details.type === 'main_frame') return {};
    let host;
    try { host = new URL(details.url).hostname; } catch { return {}; }
    if (disabledSites.includes(host)) return {};
    // Only block third-party requests so first-party site resources always load.
    const initiator = details.originUrl || details.documentUrl;
    if (!initiator) return {};
    let initiatorHost;
    try { initiatorHost = new URL(initiator).hostname; } catch { return {}; }
    if (sameSite(initiatorHost, host)) return {};
    if (isBlockedHost(host)) {
      browser.storage.local.get('blocked').then(({ blocked = 0 }) => {
        browser.storage.local.set({ blocked: blocked + 1 });
      });
      return { cancel: true };
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);