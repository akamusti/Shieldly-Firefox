const versionEl = document.getElementById('version');
const siteEl = document.getElementById('site');
const siteState = document.getElementById('siteState');
const siteEnabled = document.getElementById('siteEnabled');
const siteBlocked = document.getElementById('siteBlocked');
const totalBlocked = document.getElementById('totalBlocked');
const rulesEl = document.getElementById('rules');
const cookiesCheckbox = document.getElementById('siteCookies');
const scriptsCheckbox = document.getElementById('siteScripts');
const cosmeticCheckbox = document.getElementById('siteCosmetic');
const globalToggle = document.getElementById('toggle');
const picker = document.getElementById('picker');
const openLog = document.getElementById('openLog');
const openOptions = document.getElementById('openOptions');

let host = '';
let state = {};

versionEl.textContent = `v${browser.runtime.getManifest().version}`;

async function currentHost() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try { return new URL(tab.url).hostname; } catch { return ''; }
}

function effective(site, key, fallback) {
  return site && typeof site[key] === 'boolean' ? site[key] : fallback;
}

async function load() {
  state = await browser.storage.local.get([
    'enabled', 'blocked', 'disabledSites', 'siteSettings', 'siteStats',
    'activeRuleCount', 'cookieProtection', 'scriptControl',
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

  siteBlocked.textContent = (host && state.siteStats && state.siteStats[host] ? state.siteStats[host] : 0).toLocaleString();
  totalBlocked.textContent = (state.blocked || 0).toLocaleString();
  rulesEl.textContent = (state.activeRuleCount || 0).toLocaleString();

  siteEnabled.checked = protectionOn;
  cookiesCheckbox.checked = effective(site, 'cookieProtection', cookieProtection);
  scriptsCheckbox.checked = effective(site, 'scriptControl', scriptControl);
  cosmeticCheckbox.checked = effective(site, 'cosmeticFiltering', true);
  globalToggle.checked = enabled;

  siteEnabled.disabled = !host;
  for (const checkbox of [cookiesCheckbox, scriptsCheckbox, cosmeticCheckbox]) {
    checkbox.disabled = !host;
  }
  picker.disabled = !host;
}

async function saveSiteSettings(siteSettings) {
  if (host && !siteSettings[host]) delete siteSettings[host];
  await browser.storage.local.set({ siteSettings });
  await load();
}

siteEnabled.addEventListener('change', async () => {
  if (!host) return;
  const { disabledSites = [], siteSettings = {} } = await browser.storage.local.get(['disabledSites', 'siteSettings']);
  const next = siteEnabled.checked
    ? disabledSites.filter((h) => h !== host)
    : [...disabledSites, host];
  if (siteSettings[host]) delete siteSettings[host].enabled;
  await browser.storage.local.set({ disabledSites: next, siteSettings });
  await load();
});

async function toggleModule(key, fallback, value) {
  if (!host) return;
  const { siteSettings = {} } = await browser.storage.local.get('siteSettings');
  const site = { ...(siteSettings[host] || {}) };
  const explicit = typeof site[key] === 'boolean';

  if (explicit && value === fallback) {
    delete site[key];
  } else {
    site[key] = value;
  }
  siteSettings[host] = site;
  await saveSiteSettings(siteSettings);
}

cookiesCheckbox.addEventListener('change', async () => {
  const { cookieProtection = true } = await browser.storage.local.get('cookieProtection');
  toggleModule('cookieProtection', cookieProtection, cookiesCheckbox.checked);
});

scriptsCheckbox.addEventListener('change', async () => {
  const { scriptControl = false } = await browser.storage.local.get('scriptControl');
  toggleModule('scriptControl', scriptControl, scriptsCheckbox.checked);
});

cosmeticCheckbox.addEventListener('change', () => {
  toggleModule('cosmeticFiltering', true, cosmeticCheckbox.checked);
});

globalToggle.addEventListener('change', async () => {
  await browser.storage.local.set({ enabled: globalToggle.checked });
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
openOptions.addEventListener('click', (event) => {
  event.preventDefault();
  openOptionsPage();
});

browser.storage.onChanged.addListener(() => load());

(async () => {
  host = await currentHost();
  await load();
})();
