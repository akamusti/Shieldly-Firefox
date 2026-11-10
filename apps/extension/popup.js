const versionEl = document.getElementById('version');
const siteEl = document.getElementById('site');
const siteState = document.getElementById('siteState');
const siteToggle = document.getElementById('siteToggle');
const siteToggleLabel = document.getElementById('siteToggleLabel');
const siteBlocked = document.getElementById('siteBlocked');
const totalBlocked = document.getElementById('totalBlocked');
const rulesEl = document.getElementById('rules');
const cookiesSwitch = document.getElementById('siteCookies');
const scriptsSwitch = document.getElementById('siteScripts');
const cosmeticSwitch = document.getElementById('siteCosmetic');
const globalToggle = document.getElementById('toggle');
const picker = document.getElementById('picker');
const openLog = document.getElementById('openLog');
const openOptions = document.getElementById('openOptions');

let host = '';
let tabId = -1;
let state = {};

versionEl.textContent = `v${browser.runtime.getManifest().version}`;

async function currentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { host: '', tabId: -1 };
  let siteHost = '';
  try { siteHost = new URL(tab.url).hostname; } catch { siteHost = ''; }
  return { host: siteHost, tabId: typeof tab.id === 'number' ? tab.id : -1 };
}

async function pageBlockedCount() {
  if (tabId < 0) return (state.siteStats && state.siteStats[host]) || 0;
  try {
    const res = await browser.runtime.sendMessage({ type: 'getTabStats', tabId });
    if (res && typeof res.count === 'number') return res.count;
  } catch {
    // Background unavailable; fall back to the stored per-site counter.
  }
  return (state.siteStats && state.siteStats[host]) || 0;
}

function effective(site, key, fallback) {
  return site && typeof site[key] === 'boolean' ? site[key] : fallback;
}

function setSwitch(button, value) {
  button.setAttribute('aria-checked', String(value === true));
}

async function load() {
  state = await browser.storage.local.get([
    'enabled', 'blocked', 'disabledSites', 'siteSettings', 'siteStats',
    'activeRuleCount', 'dnrRuleCount', 'cookieProtection', 'scriptControl',
  ]);

  const enabled = state.enabled !== false;
  const disabledSites = state.disabledSites || [];
  const siteSettings = state.siteSettings || {};
  const site = siteSettings[host] || null;
  const cookieProtection = state.cookieProtection !== false;
  const scriptControl = state.scriptControl === true;

  const protectionOn = !!host && !disabledSites.includes(host) && (!site || site.enabled !== false);
  const active = enabled && protectionOn;

  siteEl.textContent = host || 'Internal page';
  siteState.textContent = !host
    ? 'No site controls available'
    : !enabled
      ? 'Global protection is off'
      : protectionOn
        ? 'Protection active on this site'
        : 'Paused on this site';
  siteState.classList.toggle('active', active);

  siteBlocked.textContent = (await pageBlockedCount()).toLocaleString();
  totalBlocked.textContent = (state.blocked || 0).toLocaleString();
  rulesEl.textContent = (state.activeRuleCount || 0).toLocaleString();

  siteToggle.dataset.on = String(active);
  siteToggle.setAttribute('aria-pressed', String(active));
  siteToggleLabel.textContent = active ? 'On' : 'Off';
  siteToggle.disabled = !host;

  setSwitch(cookiesSwitch, effective(site, 'cookieProtection', cookieProtection));
  setSwitch(scriptsSwitch, effective(site, 'scriptControl', scriptControl));
  setSwitch(cosmeticSwitch, effective(site, 'cosmeticFiltering', true));
  setSwitch(globalToggle, enabled);

  for (const button of [cookiesSwitch, scriptsSwitch, cosmeticSwitch]) {
    button.disabled = !host;
  }
  picker.disabled = !host;
}

async function saveSiteSettings(siteSettings) {
  if (host && !siteSettings[host]) delete siteSettings[host];
  await browser.storage.local.set({ siteSettings });
  await load();
}

siteToggle.addEventListener('click', async () => {
  if (!host) return;
  const { disabledSites = [], siteSettings = {} } = await browser.storage.local.get(['disabledSites', 'siteSettings']);
  const next = protectionOn()
    ? [...disabledSites, host]
    : disabledSites.filter((h) => h !== host);
  if (siteSettings[host]) delete siteSettings[host].enabled;
  await browser.storage.local.set({ disabledSites: next, siteSettings });
  await load();
});

function protectionOn() {
  return siteToggle.dataset.on === 'true';
}

async function toggleModule(key, fallback) {
  if (!host) return;
  const { siteSettings = {} } = await browser.storage.local.get('siteSettings');
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
  await saveSiteSettings(siteSettings);
}

cookiesSwitch.addEventListener('click', async () => {
  const { cookieProtection = true } = await browser.storage.local.get('cookieProtection');
  toggleModule('cookieProtection', cookieProtection);
});

scriptsSwitch.addEventListener('click', async () => {
  const { scriptControl = false } = await browser.storage.local.get('scriptControl');
  toggleModule('scriptControl', scriptControl);
});

cosmeticSwitch.addEventListener('click', () => toggleModule('cosmeticFiltering', true));

globalToggle.addEventListener('click', async () => {
  const { enabled = true } = await browser.storage.local.get('enabled');
  await browser.storage.local.set({ enabled: !enabled });
  await load();
});

picker.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    browser.tabs.sendMessage(tab.id, { type: 'startPicker' });
    window.close();
  }
});

function openOptionsPage(hash) {
  browser.tabs.create({ url: browser.runtime.getURL(`options.html${hash || ''}`) });
  window.close();
}

openLog.addEventListener('click', () => openOptionsPage('#request-log'));
openOptions.addEventListener('click', () => openOptionsPage());

browser.storage.onChanged.addListener(() => load());

(async () => {
  const tab = await currentTab();
  host = tab.host;
  tabId = tab.tabId;
  await load();
})();
