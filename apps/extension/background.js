const LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
];

let blockedDomains = new Set();
let cosmeticSelectors = [];
let disabledSites = [];
let enabled = true;

async function refreshState() {
  const st = await browser.storage.local.get(['enabled', 'disabledSites', 'cosmeticSelectors']);
  enabled = st.enabled !== false;
  disabledSites = st.disabledSites || [];
  cosmeticSelectors = st.cosmeticSelectors || [];
}

async function fetchLists() {
  const selectors = [];
  const domains = new Set();
  for (const url of LISTS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('@@')) continue;
        const dm = line.match(/^\|\|([^\^\/\s]+)\^?/);
        if (dm) domains.add(dm[1]);
        const cm = line.match(/##(.+)$/);
        if (cm && cm[1]) selectors.push(cm[1]);
      }
    } catch (e) {
      console.warn('List fetch failed', url, e);
    }
  }
  blockedDomains = domains;
  await browser.storage.local.set({ cosmeticSelectors: Array.from(new Set(selectors)) });
  await refreshState();
}

browser.runtime.onInstalled.addListener(async () => {
  const st = await browser.storage.local.get('enabled');
  if (st.enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0, disabledSites: [] });
  }
  await fetchLists();
  console.log('Privacy Shield (Firefox) installed.');
});

browser.storage.onChanged.addListener(() => refreshState());

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!enabled) return {};
    let host;
    try { host = new URL(details.url).hostname; } catch { return {}; }
    if (disabledSites.includes(host)) return {};
    for (const d of blockedDomains) {
      if (host === d || host.endsWith('.' + d)) {
        browser.storage.local.get('blocked').then(({ blocked = 0 }) => {
          browser.storage.local.set({ blocked: blocked + 1 });
        });
        return { cancel: true };
      }
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);