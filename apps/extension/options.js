const BUILTIN_LISTS = [
  { id: 'easylist', name: 'EasyList (ads)' },
  { id: 'easyprivacy', name: 'EasyPrivacy (trackers)' },
  { id: 'russian', name: 'AdGuard Russian filter' },
  { id: 'german', name: 'AdGuard German filter' },
  { id: 'japanese', name: 'AdGuard Japanese filter' },
  { id: 'dutch', name: 'AdGuard Dutch filter' },
  { id: 'spanish', name: 'AdGuard Spanish/Portuguese filter' },
  { id: 'turkish', name: 'AdGuard Turkish filter' },
  { id: 'french', name: 'AdGuard French filter' },
  { id: 'ukrainian', name: 'AdGuard Ukrainian filter' },
  { id: 'italian', name: 'AdGuard Italian filter' },
  { id: 'polish', name: 'AdGuard Polish filter' },
  { id: 'chinese', name: 'AdGuard Chinese filter' },
];

const cookieProtection = document.getElementById('cookieProtection');
const scriptControl = document.getElementById('scriptControl');
const customRules = document.getElementById('customRules');
const save = document.getElementById('save');
const saved = document.getElementById('saved');
const listsEl = document.getElementById('lists');
const sitesEl = document.getElementById('sites');
const listName = document.getElementById('listName');
const listUrl = document.getElementById('listUrl');
const addList = document.getElementById('addList');
const refreshLists = document.getElementById('refreshLists');
const listMessage = document.getElementById('listMessage');
const logEl = document.getElementById('log');
const clearLog = document.getElementById('clearLog');

function formatTime(ts) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

function chip(label, value) {
  const span = document.createElement('span');
  span.className = `chip ${value ? 'on' : 'off'}`;
  span.textContent = label;
  return span;
}

async function getState() {
  return browser.storage.local.get([
    'filterLists', 'customFilterLists', 'filterListStatus', 'customRulesText',
    'cookieProtection', 'scriptControl', 'siteSettings', 'disabledSites', 'siteStats', 'requestLog',
  ]);
}

async function load() {
  const state = await getState();
  cookieProtection.checked = state.cookieProtection !== false;
  scriptControl.checked = state.scriptControl === true;
  customRules.value = state.customRulesText || '';
  renderLists(state);
  renderSites(state);
  renderLog(state.requestLog || []);
}

function renderLists(state) {
  const filterLists = state.filterLists || {};
  const customFilterLists = state.customFilterLists || [];
  const status = state.filterListStatus || {};
  listsEl.innerHTML = '';

  const baseLists = BUILTIN_LISTS.filter((l) => l.id === 'easylist' || l.id === 'easyprivacy');
  const languageLists = BUILTIN_LISTS.filter((l) => l.id !== 'easylist' && l.id !== 'easyprivacy');

  function appendRow(container, list, builtin) {
    const enabled = builtin ? filterLists[list.id] !== false : list.enabled !== false;
    const row = document.createElement('div');
    row.className = 'list-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabled;
    checkbox.addEventListener('change', () => toggleList(list, checkbox.checked));

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = list.name || list.url;
    const statusEl = document.createElement('div');
    statusEl.className = 'status';
    const info = status[list.id];
    if (!enabled) {
      statusEl.textContent = 'Disabled';
    } else if (!info) {
      statusEl.textContent = 'Not loaded yet — refresh lists';
    } else if (info.error) {
      statusEl.classList.add('error');
      statusEl.textContent = `Error: ${info.error}`;
    } else {
      statusEl.textContent = `Updated ${formatTime(info.updatedAt)} · ${info.ruleCount} rules`;
    }
    meta.append(name, statusEl);
    if (!builtin) {
      const urlEl = document.createElement('div');
      urlEl.className = 'status';
      urlEl.textContent = list.url;
      meta.appendChild(urlEl);
    }
    row.append(checkbox, meta);

    if (!builtin) {
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => removeList(list.id));
      row.appendChild(remove);
    }
    container.appendChild(row);
  }

  for (const list of baseLists) appendRow(listsEl, { ...list, builtin: true }, true);

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Language filters (click to expand)';
  summary.style.cursor = 'pointer';
  summary.style.margin = '10px 0 6px';
  details.appendChild(summary);
  const langContainer = document.createElement('div');
  for (const list of languageLists) appendRow(langContainer, { ...list, builtin: true }, true);
  details.appendChild(langContainer);
  listsEl.appendChild(details);

  for (const list of customFilterLists) appendRow(listsEl, { ...list, builtin: false }, false);
}

async function toggleList(list, enabled) {
  if (list.builtin) {
    const { filterLists = {} } = await browser.storage.local.get('filterLists');
    filterLists[list.id] = enabled;
    await browser.storage.local.set({ filterLists });
  } else {
    const { customFilterLists = [] } = await browser.storage.local.get('customFilterLists');
    const next = customFilterLists.map((l) => (l.id === list.id ? { ...l, enabled } : l));
    await browser.storage.local.set({ customFilterLists: next });
  }
  load();
}

async function removeList(id) {
  const { customFilterLists = [] } = await browser.storage.local.get('customFilterLists');
  await browser.storage.local.set({ customFilterLists: customFilterLists.filter((l) => l.id !== id) });
  load();
}

addList.addEventListener('click', async () => {
  const url = listUrl.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    flash('Enter a valid http(s) filter list URL.');
    return;
  }
  const { customFilterLists = [] } = await browser.storage.local.get('customFilterLists');
  if (customFilterLists.some((l) => l.url === url)) {
    flash('That list is already added.');
    return;
  }
  const id = `custom-${Date.now().toString(36)}`;
  const name = listName.value.trim() || new URL(url).hostname;
  await browser.storage.local.set({
    customFilterLists: [...customFilterLists, { id, name, url, enabled: true, updatedAt: null }],
  });
  listName.value = '';
  listUrl.value = '';
  flash('List added.');
  load();
});

refreshLists.addEventListener('click', async () => {
  flash('Refreshing…');
  try {
    await browser.runtime.sendMessage({ type: 'refreshLists' });
    flash('Lists refreshed.');
  } catch (e) {
    flash('Refresh failed. Reload the extension and try again.');
  }
  load();
});

function flash(message) {
  listMessage.textContent = message;
  setTimeout(() => { listMessage.textContent = ''; }, 4000);
}

function renderSites(state) {
  const siteSettings = state.siteSettings || {};
  const disabledSites = state.disabledSites || [];
  const hosts = Array.from(new Set([...Object.keys(siteSettings), ...disabledSites])).sort();
  sitesEl.innerHTML = '';
  if (!hosts.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No per-site overrides yet. Use the popup on any site.';
    sitesEl.appendChild(empty);
    return;
  }

  for (const host of hosts) {
    const site = siteSettings[host] || {};
    const enabled = !disabledSites.includes(host) && site.enabled !== false;
    const row = document.createElement('div');
    row.className = 'site-row';

    const hostEl = document.createElement('div');
    hostEl.className = 'host';
    hostEl.textContent = host;

    const blockedCount = (state.siteStats && state.siteStats[host]) || 0;
    row.append(
      hostEl,
      chip(enabled ? 'Protection' : 'Paused', enabled),
      chip(`Blocked ${blockedCount.toLocaleString()}`, blockedCount > 0),
      chip('Cookies', typeof site.cookieProtection === 'boolean' ? site.cookieProtection : state.cookieProtection !== false),
      chip('Scripts', typeof site.scriptControl === 'boolean' ? site.scriptControl : state.scriptControl === true),
      chip('Cosmetic', typeof site.cosmeticFiltering === 'boolean' ? site.cosmeticFiltering : true),
    );

    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.addEventListener('click', async () => {
      const current = await getState();
      const nextSettings = { ...(current.siteSettings || {}) };
      delete nextSettings[host];
      await browser.storage.local.set({
        siteSettings: nextSettings,
        disabledSites: (current.disabledSites || []).filter((h) => h !== host),
      });
      load();
    });
    row.appendChild(reset);
    sitesEl.appendChild(row);
  }
}

function renderLog(entries) {
  logEl.innerHTML = '';
  for (const entry of entries.slice(0, 100)) {
    const li = document.createElement('li');
    li.textContent = `${new Date(entry.time).toLocaleTimeString()} — ${entry.url}`;
    logEl.appendChild(li);
  }
}

save.addEventListener('click', async () => {
  await browser.storage.local.set({
    customRulesText: customRules.value,
    cookieProtection: cookieProtection.checked,
    scriptControl: scriptControl.checked,
  });
  saved.textContent = 'Saved.';
  setTimeout(() => { saved.textContent = ''; }, 3000);
});

clearLog.addEventListener('click', async () => {
  await browser.storage.local.set({ requestLog: [] });
  renderLog([]);
});

browser.storage.onChanged.addListener((changes) => {
  if (
    changes.filterLists || changes.customFilterLists || changes.filterListStatus ||
    changes.cookieProtection || changes.scriptControl || changes.siteSettings ||
    changes.disabledSites || changes.requestLog
  ) {
    load();
  }
});

load();
