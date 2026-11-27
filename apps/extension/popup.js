/*
 * Shieldly popup — layout inspired by uBlock Origin's panel.
 * Kept: hostname + power switch, one page-stat line, per-site module
 * switches, a compact tool ribbon and the global protection toggle.
 * Removed: the status caption line, the extra statistics lines, the
 * version row, zapper, report links and troubleshooting ribbons.
 * The dynamic-filtering firewall matrix is back (allow/block/noop).
 */
const api = typeof browser !== 'undefined' ? browser : chrome;

const els = {
  hostSub: document.getElementById('hostSub'),
  hostDomain: document.getElementById('hostDomain'),
  power: document.getElementById('power'),
  reloadTab: document.getElementById('reloadTab'),
  pageBlocked: document.getElementById('pageBlocked'),
  pagePct: document.getElementById('pagePct'),
  pageHidden: document.getElementById('pageHidden'),
  scriptletStatus: document.getElementById('scriptletStatus'),
  siteCookies: document.getElementById('siteCookies'),
  siteScripts: document.getElementById('siteScripts'),
  siteCosmetic: document.getElementById('siteCosmetic'),
  siteYouTube: document.getElementById('siteYouTube'),
  picker: document.getElementById('picker'),
  openLog: document.getElementById('openLog'),
  openOptions: document.getElementById('openOptions'),
  globalToggle: document.getElementById('toggle'),
  fwHost: document.getElementById('fwHost'),
  fwTarget: document.getElementById('fwTarget'),
  fwType: document.getElementById('fwType'),
  fwRules: document.getElementById('fwRules'),
  fwSet: Array.from(document.querySelectorAll('.fwSet')),
};

let host = '';
let tabId = -1;
let state = {};
let stats = { count: 0, seen: 0, hidden: 0 };
let dirty = false;

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
          hidden: Number(res.hidden) || 0,
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
    hidden: (state.siteHiddenStats && state.siteHiddenStats[host]) || 0,
  };
  return stats;
}

function isYouTubeHost(value) {
  const name = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  return name === 'youtube.com' || name.endsWith('.youtube.com') || name === 'youtu.be';
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
  els.pageHidden.textContent = (stats.hidden || 0).toLocaleString();
  els.scriptletStatus.hidden = !isYouTubeHost(host);
  if (!els.scriptletStatus.hidden) {
    els.scriptletStatus.textContent = state.youtubeScriptletActive === true
      ? 'Player scriptlet: aktif'
      : 'Player scriptlet: aktif değil — sayfayı yenileyin';
  }

  setSwitch(els.siteCookies, effective(site, 'cookieProtection', cookieProtection));
  setSwitch(els.siteScripts, effective(site, 'scriptControl', scriptControl));
  setSwitch(els.siteCosmetic, effective(site, 'cosmeticFiltering', true));
  setSwitch(els.globalToggle, enabled);

  // The YouTube switch only exists on YouTube; it is on out of the box.
  const youtube = isYouTubeHost(host);
  els.siteYouTube.hidden = !youtube;
  setSwitch(els.siteYouTube, effective(site, 'youtubeAdBlocking', true));

  for (const button of [els.siteCookies, els.siteScripts, els.siteCosmetic, els.picker]) {
    button.disabled = !host;
  }
  els.siteYouTube.disabled = !youtube;
  els.reloadTab.classList.toggle('visible', dirty && tabId >= 0);
  renderFirewall();
}

// Mirrors resolveDynamicAction() from @privacy-shield/site-controls: A = allow,
// B = block, N = no-op (skip lower-priority filters for that request).
function renderFirewall() {
  els.fwHost.textContent = host || 'no site';
  for (const button of els.fwSet) button.disabled = !host;
  const rules = (state.dynamicRules || []).filter((rule) => rule.hostname === host);
  els.fwRules.innerHTML = '';
  if (!rules.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No dynamic rules for this site.';
    empty.style.opacity = '.55';
    els.fwRules.appendChild(empty);
    return;
  }
  for (const rule of rules) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    const label = document.createElement('span');
    label.textContent = `${rule.target} · ${rule.type} → ${rule.action}`;
    label.style.flex = '1';
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = 'Remove rule';
    remove.addEventListener('click', async () => {
      const { dynamicRules = [] } = await api.storage.local.get('dynamicRules');
      await api.storage.local.set({
        dynamicRules: dynamicRules.filter((entry) =>
          !(entry.hostname === rule.hostname && entry.target === rule.target && entry.type === rule.type)),
      });
      markDirty();
      await load();
    });
    row.append(label, remove);
    els.fwRules.appendChild(row);
  }
  for (const button of els.fwSet) button.disabled = !host;
}

async function load() {
  state = await api.storage.local.get([
    'enabled', 'disabledSites', 'siteSettings', 'siteStats', 'siteHiddenStats', 'youtubeScriptletActive',
    'cookieProtection', 'scriptControl', 'dynamicRules',
  ]);
  await fetchStats();
  render();
}

async function refreshStats() {
  const fresh = await api.storage.local.get(['siteStats', 'siteHiddenStats']);
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

els.siteYouTube.addEventListener('click', () => toggleModule('youtubeAdBlocking', true));

for (const button of els.fwSet) {
  button.addEventListener('click', async () => {
    if (!host) return;
    const target = els.fwTarget.value.trim().toLowerCase().replace(/^\*\.\./, '');
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(target) && target !== '*') return;
    const rule = { hostname: host, target, type: els.fwType.value, action: button.dataset.action };
    const { dynamicRules = [] } = await api.storage.local.get('dynamicRules');
    const next = dynamicRules.filter((entry) =>
      !(entry.hostname === rule.hostname && entry.target === rule.target && entry.type === rule.type));
    await api.storage.local.set({ dynamicRules: [...next, rule].slice(-300) });
    els.fwTarget.value = '';
    markDirty();
    await load();
  });
}

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
  if (changes.siteStats) {
    refreshStats();
    return;
  }
  if (
    changes.enabled || changes.disabledSites || changes.siteSettings ||
    changes.cookieProtection || changes.scriptControl || changes.dynamicRules ||
    changes.siteHiddenStats || changes.youtubeScriptletActive
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
