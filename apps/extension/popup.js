const toggle = document.getElementById('toggle');
const siteToggle = document.getElementById('siteToggle');
const countEl = document.getElementById('count');
const siteEl = document.getElementById('site');
const picker = document.getElementById('picker');

async function currentHost() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  try { return new URL(tab.url).hostname; } catch { return ''; }
}

async function load() {
  const { enabled = true, blocked = 0, disabledSites = [] } = await browser.storage.local.get(['enabled', 'blocked', 'disabledSites']);
  toggle.textContent = enabled ? 'On' : 'Off';
  countEl.textContent = String(blocked);
  const host = await currentHost();
  siteEl.textContent = host;
  siteToggle.textContent = disabledSites.includes(host) ? 'Disabled' : 'Enabled';
}

toggle.addEventListener('click', async () => {
  const { enabled = true } = await browser.storage.local.get('enabled');
  await browser.storage.local.set({ enabled: !enabled });
  toggle.textContent = !enabled ? 'On' : 'Off';
});

siteToggle.addEventListener('click', async () => {
  const host = await currentHost();
  if (!host) return;
  const { disabledSites = [] } = await browser.storage.local.get('disabledSites');
  const next = disabledSites.includes(host)
    ? disabledSites.filter((h) => h !== host)
    : [...disabledSites, host];
  await browser.storage.local.set({ disabledSites: next });
  siteToggle.textContent = next.includes(host) ? 'Disabled' : 'Enabled';
});

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