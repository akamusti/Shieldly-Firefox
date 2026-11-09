const LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
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

async function refreshState(keys) {
  const st = await browser.storage.local.get(['enabled', 'disabledSites', 'cosmeticSelectors']);
  if (!keys || keys.includes('enabled')) enabled = st.enabled !== false;
  if (!keys || keys.includes('disabledSites')) disabledSites = st.disabledSites || [];
  if (!keys || keys.includes('cosmeticSelectors')) cosmeticSelectors = st.cosmeticSelectors || [];
}

async function fetchLists() {
  const selectors = new Set();
  const domains = new Set();
  for (const url of LISTS) {
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
        const cm = line.match(/##(.+)$/);
        if (cm && cm[1]) selectors.add(cm[1]);
      }
    } catch (e) {
      console.warn('List fetch failed', url, e);
    }
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