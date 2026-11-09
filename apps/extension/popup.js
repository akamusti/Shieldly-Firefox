const toggle = document.getElementById('toggle');
const siteToggle = document.getElementById('siteToggle');
const siteCookies = document.getElementById('siteCookies');
const siteScripts = document.getElementById('siteScripts');
const siteCosmetic = document.getElementById('siteCosmetic');
const countEl = document.getElementById('count');
const siteEl = document.getElementById('site');
const picker = document.getElementById('picker');

let host = '';

async function currentHost() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  try { return new URL(tab.url).hostname; } catch { return ''; }
}

function moduleLabel(site, key, globalValue) {
  if (site && typeof site[key] === 'boolean') return site[key] ? 'On' : 'Off';
  return `Default (${globalValue ? 'On' : 'Off'})`;
}

function applyStateClass(button, value) {
  button.classList.toggle('on', value === true);
  button.classList.toggle('off', value === false);
}

async function load() {
  const {
    enabled = true,
    blocked = 0,
    disabledSites = [],
    siteSettings = {},
    cookieProtection = true,
    scriptControl = false,
  } = await browser.storage.local.get([
    'enabled', 'blocked', 'disabledSites', 'siteSettings', 'cookieProtection', 'scriptControl',
  ]);

  toggle.textContent = enabled ? 'On' : 'Off';
  countEl.textContent = String(blocked);

  host = host || (await currentHost());
  const site = siteSettings[host] || null;
  const siteEnabled = !disabledSites.includes(host) && (!site || site.enabled !== false);

  siteEl.textContent = host;
  siteToggle.textContent = siteEnabled ? 'Enabled' : 'Disabled';
  siteToggle.classList.toggle('off', !siteEnabled);
  siteToggle.classList.toggle('on', siteEnabled);

  siteCookies.textContent = moduleLabel(site, 'cookieProtection', cookieProtection);
  siteScripts.textContent = moduleLabel(site, 'scriptControl', scriptControl);
  siteCosmetic.textContent = moduleLabel(site, 'cosmeticFiltering', true);
  applyStateClass(siteCookies, site && typeof site.cookieProtection === 'boolean' ? site.cookieProtection : cookieProtection);
  applyStateClass(siteScripts, site && typeof site.scriptControl === 'boolean' ? site.scriptControl : scriptControl);
  applyStateClass(siteCosmetic, site && typeof site.cosmeticFiltering === 'boolean' ? site.cosmeticFiltering : true);
}

async function patchSite(patch) {
  if (!host) return;
  const { siteSettings = {} } = await browser.storage.local.get('siteSettings');
  siteSettings[host] = { ...(siteSettings[host] || {}), ...patch };
  await browser.storage.local.set({ siteSettings });
}

toggle.addEventListener('click', async () => {
  const { enabled = true } = await browser.storage.local.get('enabled');
  await browser.storage.local.set({ enabled: !enabled });
  load();
});

siteToggle.addEventListener('click', async () => {
  if (!host) return;
  const { disabledSites = [], siteSettings = {} } = await browser.storage.local.get(['disabledSites', 'siteSettings']);
  const next = disabledSites.includes(host)
    ? disabledSites.filter((h) => h !== host)
    : [...disabledSites, host];
  if (siteSettings[host]) delete siteSettings[host].enabled;
  await browser.storage.local.set({ disabledSites: next, siteSettings });
  load();
});

async function toggleModule(key, globalValue) {
  if (!host) return;
  const { siteSettings = {} } = await browser.storage.local.get('siteSettings');
  const site = siteSettings[host] || {};
  const current = typeof site[key] === 'boolean' ? site[key] : globalValue;
  site[key] = !current;
  siteSettings[host] = site;
  await browser.storage.local.set({ siteSettings });
  load();
}

siteCookies.addEventListener('click', async () => {
  const { cookieProtection = true } = await browser.storage.local.get('cookieProtection');
  toggleModule('cookieProtection', cookieProtection);
});

siteScripts.addEventListener('click', async () => {
  const { scriptControl = false } = await browser.storage.local.get('scriptControl');
  toggleModule('scriptControl', scriptControl);
});

siteCosmetic.addEventListener('click', () => toggleModule('cosmeticFiltering', true));

picker.addEventListener('click', async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab && tab.id) {
    browser.tabs.sendMessage(tab.id, { type: 'startPicker' });
    window.close();
  }
});

load();
browser.storage.onChanged.addListener(() => load());
