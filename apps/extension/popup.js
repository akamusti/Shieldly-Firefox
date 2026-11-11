/*
 * Privacy Shield popup — layout inspired by uBlock Origin's panel.
 * Kept: hostname + power switch, per-site module switches, three stats
 * lines, and a compact tool ribbon. Removed: the dynamic-filtering
 * firewall matrix, zapper, report links and troubleshooting ribbons.
 */
const api = typeof browser !== 'undefined' ? browser : chrome;

const els = {
  version: document.getElementById('version'),
  hostSub: document.getElementById('hostSub'),
  hostDomain: document.getElementById('hostDomain'),
  siteState: document.getElementById('siteState'),
  power: document.getElementById('power'),
  reloadTab: document.getElementById('reloadTab'),
  pageBlocked: document.getElementById('pageBlocked'),
  pagePct: document.getElementById('pagePct'),
  domains: document.getElementById('domains'),
  totalBlocked: document.getElementById('totalBlocked'),
  siteCookies: document.getElementById('siteCookies'),
  siteScripts: document.getElementById('siteScripts'),
  siteCosmetic: document.getElementById('siteCosmetic'),
  picker: document.getElementById('picker'),
  openLog: document.getElementById('openLog'),
  openOptions: document.getElementById('openOptions'),
  globalToggle: document.getElementById('toggle'),
};

let host = '';
let tabId = -1;
let state = {};
let stats = { count: 0, seen: 0, domains: 0, touched: 0 };
let dirty = false;

els.version.textContent = `v${api.runtime.getManifest().version}`;

async function currentTab() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { host: '', tabId: -1 };
    let siteHost = '';
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') siteHost = url.hostname;
    } catch {
      siteHost = '';
    }
    return { host: siteHost, tabId: typeof tab.id === 'number' ? tab.id : -1 };
  } catch {
    return { host: '', tabId: -1 };
  }
}

async function fetchStats() {
  if (tabId >= 0) {
    try {
      const res = await api.runtime.sendMessage({ type: 'getTabStats', tabId });
      if (res && typeof res === 'object') {
        stats = {
          count: Number(res.count) || 0,
          seen: Number(res.seen) || 0,
          domains: Number(res.domains) || 0,
          touched: Number(res.touched) || 0,
        };
        return stats;
      }
    } catch {
      // Background unavailable; fall back to the stored per-site counter.
    }
  }
  stats = {
    count: (state.siteStats && state.siteStats[host]) || 0,
    seen: 0,
    domains: 0,
    touched: 0,
  };
  return stats;
}

function splitHost(value) {
  const dot = value.indexOf('.');
  if (dot < 0) return { sub: '', dom: value };
  return { sub: value.slice(0, dot + 1), dom: value.slice(dot + 1) };
}

function effective(site, key, fallback) {
  return site && typeof site[key] === 'boolean' ? site[key] : fallback;
}

function setSwitch(button, value) {
  const on = value === true;
  button.setAttribute('aria-checked', String(on));
  button.dataset.on = String(on);
}

function render() {
  const enabled = state.enabled !== false;
  const disabledSites = state.disabledSites || [];
  const siteSettings = state.siteSettings || {};
  const site = siteSettings[host] || null;
  const cookieProtection = state.cookieProtection !== false;
  const scriptControl = state.scriptControl === true;

  const siteOn = !!host && !disabledSites.includes(host) && (!site || site.enabled !== false);
  const active = enabled && siteOn;

  const { sub, dom } = splitHost(host);
  els.hostSub.textContent = sub;
  els.hostDomain.textContent = dom || 'Internal page';

  els.siteState.textContent = !host
    ? 'No site controls available'
    : !enabled
      ? 'Global protection is off'
      : siteOn
        ? 'Protection active on this site'
        : 'Paused on this site';
  els.siteState.dataset.state = active ? 'on' : 'off';

  els.power.dataset.on = String(active);
  els.power.setAttribute('aria-checked', String(active));
  els.power.disabled = !host;
  els.power.title = !host
    ? 'No site controls available'
    : active
      ? 'Turn off protection for this site'
      : 'Turn on protection for this site';
  els.power.setAttribute('aria-label', els.power.title);

  const blocked = stats.count;
  const total = Math.max(stats.seen, blocked);
  const percent = total > 0 ? Math.min(100, Math.round((blocked * 100) / total)) : 0;
  els.pageBlocked.textContent = blocked.toLocaleString();
  els.pagePct.textContent = total > 0 ? ` (${percent}%)` : '';
  els.domains.textContent = stats.domains > 0 ? `${stats.touched} of ${stats.domains}` : '0';
  els.totalBlocked.textContent = (state.blocked || 0).toLocaleString();

  setSwitch(els.siteCookies, effective(site, 'cookieProtection', cookieProtection));
  setSwitch(els.siteScripts, effective(site, 'scriptControl', scriptControl));
  setSwitch(els.siteCosmetic, effective(site, 'cosmeticFiltering', true));
  setSwitch(els.globalToggle, enabled);

  for (const button of [els.siteCookies, els.siteScripts, els.siteCosmetic, els.picker]) {
    button.disabled = !host;
  }
  els.reloadTab.classList.toggle('visible', dirty && tabId >= 0);
}

async function load() {
  state = await api.storage.local.get([
    'enabled', 'blocked', 'disabledSites', 'siteSettings', 'siteStats',
    'activeRuleCount', 'dnrRuleCount', 'cookieProtection', 'scriptControl',
  ]);
  await fetchStats();
  render();
}

async function refreshStats() {
  const fresh = await api.storage.local.get(['blocked', 'siteStats']);
  state = { ...state, ...fresh };
  await fetchStats();
  render();
}

function markDirty() {
  dirty = true;
  els.reloadTab.classList.add('visible');
}

async function saveSiteSettings(siteSettings) {
  if (host && siteSettings[host] && Object.keys(siteSettings[host]).length === 0) {
    delete siteSettings[host];
  }
  await api.storage.local.set({ siteSettings });
  await load();
}

els.power.addEventListener('click', async () => {
  if (!host) return;
  const stored = await api.storage.local.get(['enabled', 'disabledSites', 'siteSettings']);
  const enabled = stored.enabled !== false;
  const disabledSites = new Set(stored.disabledSites || []);
  const siteSettings = stored.siteSettings || {};
  const site = siteSettings[host] || {};
  const siteOn = !disabledSites.has(host) && site.enabled !== false;

  // When global protection is off, the first click turns everything back on
  // for this site instead of silently toggling a paused site.
  if (!enabled) {
    await api.storage.local.set({ enabled: true });
  }

  if (enabled && siteOn) {
    disabledSites.add(host);
  } else {
    disabledSites.delete(host);
  }
  if (siteSettings[host]) {
    delete siteSettings[host].enabled;
    if (Object.keys(siteSettings[host]).length === 0) delete siteSettings[host];
  }

  await api.storage.local.set({
    disabledSites: Array.from(disabledSites),
    siteSettings,
  });
  markDirty();
  await load();
});

async function toggleModule(key, fallback) {
  if (!host) return;
  const { siteSettings = {} } = await api.storage.local.get('siteSettings');
  const site = { ...(siteSettings[host] || {}) };
  const explicit = typeof site[key] === 'boolean';
  const current = explicit ? site[key] : fallback;
  const next = !current;

  if (explicit && next === fallback) {
    delete site[key];
  } else {
    site[key] = next;
  }
  siteSettings[host] = site;
  markDirty();
  await saveSiteSettings(siteSettings);
}

els.siteCookies.addEventListener('click', async () => {
  const { cookieProtection = true } = await api.storage.local.get('cookieProtection');
  toggleModule('cookieProtection', cookieProtection);
});

els.siteScripts.addEventListener('click', async () => {
  const { scriptControl = false } = await api.storage.local.get('scriptControl');
  toggleModule('scriptControl', scriptControl);
});

els.siteCosmetic.addEventListener('click', () => toggleModule('cosmeticFiltering', true));

els.globalToggle.addEventListener('click', async () => {
  const { enabled = true } = await api.storage.local.get('enabled');
  await api.storage.local.set({ enabled: !enabled });
  markDirty();
  await load();
});

els.reloadTab.addEventListener('click', async () => {
  if (tabId < 0) return;
  try {
    await api.tabs.reload(tabId);
  } catch {
    // The tab may have closed while the popup was open.
  }
  window.close();
});

els.picker.addEventListener('click', async () => {
  if (tabId < 0) return;
  try {
    await api.tabs.sendMessage(tabId, { type: 'startPicker' });
  } catch {
    // Content script unavailable on this page.
  }
  window.close();
});

function openOptionsPage(hash) {
  api.tabs.create({ url: api.runtime.getURL(`options.html${hash || ''}`) });
  window.close();
}

els.openLog.addEventListener('click', () => openOptionsPage('#request-log'));
els.openOptions.addEventListener('click', () => openOptionsPage());

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.blocked || changes.siteStats) {
    refreshStats();
    return;
  }
  if (
    changes.enabled || changes.disabledSites || changes.siteSettings ||
    changes.cookieProtection || changes.scriptControl ||
    changes.activeRuleCount || changes.dnrRuleCount
  ) {
    load();
  }
});

(async () => {
  const tab = await currentTab();
  host = tab.host;
  tabId = tab.tabId;
  await load();
})();
