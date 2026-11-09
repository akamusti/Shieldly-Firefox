const versionEl = document.getElementById('version');
const siteEl = document.getElementById('site');
const siteState = document.getElementById('siteState');
const siteToggle = document.getElementById('siteToggle');
const siteBlocked = document.getElementById('siteBlocked');
const totalBlocked = document.getElementById('totalBlocked');
const rulesEl = document.getElementById('rules');
const cookiesSwitch = document.getElementById('siteCookies');
const scriptsSwitch = document.getElementById('siteScripts');
const cosmeticSwitch = document.getElementById('siteCosmetic');
const cookiesHint = document.getElementById('cookiesHint');
const scriptsHint = document.getElementById('scriptsHint');
const cosmeticHint = document.getElementById('cosmeticHint');
const overrideNote = document.getElementById('overrideNote');
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

function setSwitch(button, value) {
  button.setAttribute('aria-checked', String(value === true));
}

function effective(site, key, fallback) {
  return site && typeof site[key] === 'boolean' ? site[key] : fallback;
}

function setHint(element, site, key, fallback) {
  if (site && typeof site[key] === 'boolean') {
    element.textContent = `Site override · ${site[key] ? 'on' : 'off'}`;
    element.style.color = 'var(--accent)';
  } else {
    element.textContent = `Default · ${fallback ? 'on' : 'off'}`;
    element.style.color = '';
  }
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

  const siteEnabled = !!host && !disabledSites.includes(host) && (!site || site.enabled !== false);
  const active = enabled && siteEnabled;

  siteEl.textContent = host || 'Internal page';
  siteState.textContent = !host
    ? 'No site controls available'
    : !enabled
      ? 'Global protection is off'
      : siteEnabled
        ? 'Protection active on this site'
        : 'Paused on this site';
  siteState.className = `site-state ${active ? 'on' : 'off'}`;

  siteToggle.dataset.on = String(active);
  siteToggle.setAttribute('aria-pressed', String(active));
  siteToggle.disabled = !host || !enabled;

  siteBlocked.textContent = (host && state.siteStats && state.siteStats[host] ? state.siteStats[host] : 0).toLocaleString();
  totalBlocked.textContent = (state.blocked || 0).toLocaleString();
  rulesEl.textContent = (state.activeRuleCount || 0).toLocaleString();

  const cookieValue = effective(site, 'cookieProtection', cookieProtection);
  const scriptValue = effective(site, 'scriptControl', scriptControl);
  const cosmeticValue = effective(site, 'cosmeticFiltering', true);

  setSwitch(cookiesSwitch, cookieValue);
  setSwitch(scriptsSwitch, scriptValue);
  setSwitch(cosmeticSwitch, cosmeticValue);
  setSwitch(globalToggle, enabled);
  setHint(cookiesHint, site, 'cookieProtection', cookieProtection);
  setHint(scriptsHint, site, 'scriptControl', scriptControl);
  setHint(cosmeticHint, site, 'cosmeticFiltering', true);

  const overrideCount = site ? Object.keys(site).filter((k) => k !== 'enabled').length : 0;
  overrideNote.textContent = overrideCount ? `${overrideCount} override${overrideCount > 1 ? 's' : ''}` : 'Using defaults';

  for (const button of [cookiesSwitch, scriptsSwitch, cosmeticSwitch]) {
    button.disabled = !host;
  }
}

async function saveSiteSettings(siteSettings) {
  if (host && !siteSettings[host]) delete siteSettings[host];
  await browser.storage.local.set({ siteSettings });
  await load();
}

siteToggle.addEventListener('click', async () => {
  if (!host) return;
  const { disabledSites = [], siteSettings = {} } = await browser.storage.local.get(['disabledSites', 'siteSettings']);
  const next = disabledSites.includes(host)
    ? disabledSites.filter((h) => h !== host)
    : [...disabledSites, host];
  if (siteSettings[host]) delete siteSettings[host].enabled;
  await browser.storage.local.set({ disabledSites: next, siteSettings });
  await load();
});

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
  host = await currentHost();
  await load();
})();
