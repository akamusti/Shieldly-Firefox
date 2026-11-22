const BUILTIN_LISTS = [
  { id: 'easylist', name: 'EasyList (ads)' },
  { id: 'easyprivacy', name: 'EasyPrivacy (trackers)' },
  { id: 'privacy-removeparam', name: 'AdGuard/uBO URL Tracking Protection' },
  { id: 'peter-lowe-blocklist', name: "Peter Lowe's Blocklist" },
  { id: 'annoyances', name: 'AdGuard Annoyances filter' },
  { id: 'adguard-spyware', name: 'AdGuard Spyware filter' },
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
const webRtcProtection = document.getElementById('webRtcProtection');
const antiBlockerDefusing = document.getElementById('antiBlockerDefusing');
const strictBlocking = document.getElementById('strictBlocking');
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
const blockedElements = document.getElementById('blockedElements');

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
    'cookieProtection', 'scriptControl', 'webRtcProtection', 'antiBlockerDefusing', 'strictBlocking', 'siteSettings', 'disabledSites', 'siteStats', 'requestLog',
    'customCosmetic', 'whitelist', 'unsupportedRules', 'dynamicRules', 'dnrQuotaNotice',
  ]);
}

async function load() {
  const state = await getState();
  cookieProtection.checked = state.cookieProtection !== false;
  scriptControl.checked = state.scriptControl === true;
  webRtcProtection.checked = state.webRtcProtection === true;
  antiBlockerDefusing.checked = state.antiBlockerDefusing !== false;
  strictBlocking.checked = state.strictBlocking !== false;
  customRules.value = state.customRulesText || '';
  renderLists(state);
  document.getElementById('quotaNotice').textContent = state.dnrQuotaNotice || '';
  renderSites(state);
  renderBlockedElements(state);
  renderWhitelist(state);
  renderUnsupported(state.unsupportedRules || []);
  renderMyRules(state.dynamicRules || []);
  renderRuleSummary(customRules.value);
  renderLog(state.requestLog || []);
}

function renderLists(state) {
  const filterLists = state.filterLists || {};
  const customFilterLists = state.customFilterLists || [];
  const status = state.filterListStatus || {};
  listsEl.innerHTML = '';

  const baseLists = BUILTIN_LISTS.filter((l) => ['easylist', 'easyprivacy', 'privacy-removeparam', 'peter-lowe-blocklist', 'annoyances', 'adguard-spyware'].includes(l.id));
  const languageLists = BUILTIN_LISTS.filter((l) => !baseLists.includes(l));

  function appendRow(container, list, builtin) {
    const enabled = builtin
      ? filterLists[list.id] === undefined
        ? baseLists.some((base) => base.id === list.id)
        : filterLists[list.id] !== false
      : list.enabled !== false;
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

// Mirrors summarizeRules() in @privacy-shield/filter-manager.
function renderRuleSummary(text) {
  const summary = { total: 0, network: 0, exception: 0, cosmetic: 0, invalid: 0 };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || (line.startsWith('#') && !line.includes('##'))) continue;
    summary.total += 1;
    if (line.includes('##') || line.includes('#@#')) summary.cosmetic += 1;
    else if (line.startsWith('@@')) summary.exception += 1;
    else if (/^[|*]/.test(line) || /\.$/.test(line)) summary.network += 1;
    else summary.invalid += 1;
  }
  document.getElementById('ruleSummary').textContent =
    `${summary.total} rules · ${summary.network} network · ${summary.cosmetic} cosmetic · ` +
    `${summary.exception} exceptions · ${summary.invalid} unrecognized`;
}

function renderMyRules(rules) {
  const container = document.getElementById('myRules');
  container.innerHTML = '';
  if (!rules.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No dynamic rules yet. Use the Allow/Block/Noop buttons in the popup.';
    container.appendChild(empty);
    return;
  }
  for (const rule of rules.slice().reverse()) {
    const row = document.createElement('div');
    row.className = 'site-row';
    const label = document.createElement('div');
    label.className = 'host';
    label.textContent = `${rule.hostname} → ${rule.target} · ${rule.type} → ${rule.action}`;
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const { dynamicRules = [] } = await browser.storage.local.get('dynamicRules');
      await browser.storage.local.set({
        dynamicRules: dynamicRules.filter((entry) =>
          !(entry.hostname === rule.hostname && entry.target === rule.target && entry.type === rule.type)),
      });
      load();
    });
    row.append(label, remove);
    container.appendChild(row);
  }
}

for (const button of document.querySelectorAll('#dashTabs button')) {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.scroll);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Rules listed in PROJECT_SPEC as "report unsupported filters to the user".
function renderUnsupported(entries) {
  const container = document.getElementById('unsupportedRules');
  container.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.textContent = 'None. All list rules are handled.';
    container.appendChild(empty);
    return;
  }
  for (const entry of entries.slice(0, 50)) {
    const li = document.createElement('li');
    li.textContent = `${entry.list || 'list'}: ${entry.line} — ${(entry.options || []).join(', ')}`;
    container.appendChild(li);
  }
}

// uBO-style whitelist: these hosts (and their subdomains) are never blocked.
function renderWhitelist(state) {
  const hosts = Array.isArray(state.whitelist) ? state.whitelist.slice().sort() : [];
  const container = document.getElementById('whitelist');
  container.innerHTML = '';
  if (!hosts.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No whitelisted hosts. @@ exceptions from filter lists are added automatically.';
    container.appendChild(empty);
    return;
  }
  for (const host of hosts) {
    const row = document.createElement('div');
    row.className = 'site-row';
    const label = document.createElement('div');
    label.className = 'host';
    label.textContent = host;
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const { whitelist = [] } = await browser.storage.local.get('whitelist');
      await browser.storage.local.set({ whitelist: whitelist.filter((entry) => entry !== host) });
      load();
    });
    row.append(label, remove);
    container.appendChild(row);
  }
}

document.getElementById('addWhitelist').addEventListener('click', async () => {
  const input = document.getElementById('whitelistHost');
  const host = input.value.trim().toLowerCase().replace(/^\*\.\./, '');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) {
    flash('Enter a valid hostname, e.g. example.com.');
    return;
  }
  const { whitelist = [] } = await browser.storage.local.get('whitelist');
  if (!whitelist.includes(host)) await browser.storage.local.set({ whitelist: [...whitelist, host] });
  input.value = '';
  load();
});

// Elements the user blocked with the right-click menu or the element picker.
function renderBlockedElements(state) {
  const rules = state.customCosmetic || [];
  blockedElements.innerHTML = '';
  if (!rules.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No blocked elements yet. Right-click an element and choose “Privacy Shield → Block element”.';
    blockedElements.appendChild(empty);
    return;
  }

  for (const rule of rules) {
    const row = document.createElement('div');
    row.className = 'site-row';

    const separator = rule.indexOf('##');
    const host = separator > 0 ? rule.slice(0, separator) : '';
    const selector = separator > 0 ? rule.slice(separator + 2) : rule;

    const entry = document.createElement('div');
    entry.className = 'host';
    entry.style.wordBreak = 'break-all';
    entry.textContent = host ? `${host} — ${selector}` : selector;
    row.appendChild(entry);

    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const current = await getState();
      await browser.storage.local.set({
        customCosmetic: (current.customCosmetic || []).filter((entry) => entry !== rule),
      });
      load();
    });
    row.appendChild(remove);

    blockedElements.appendChild(row);
  }
}

let lastLog = [];

function renderLog(entries) {
  lastLog = entries || [];
  logEl.innerHTML = '';
  const query = (document.getElementById('logFilter').value || '').trim().toLowerCase();
  for (const entry of lastLog.slice(0, 100)) {
    const reason = entry.reason || 'block';
    const rule = entry.rule ? ` [${entry.rule}]` : '';
    const line = `${new Date(entry.time).toLocaleTimeString()} — ${reason}${rule} — ${entry.url}`;
    if (query && !line.toLowerCase().includes(query)) continue;
    const li = document.createElement('li');
    li.textContent = line;
    logEl.appendChild(li);
  }
}

document.getElementById('logFilter').addEventListener('input', () => renderLog(lastLog));

save.addEventListener('click', async () => {
  await browser.storage.local.set({
    customRulesText: customRules.value,
    cookieProtection: cookieProtection.checked,
    scriptControl: scriptControl.checked,
    webRtcProtection: webRtcProtection.checked,
    antiBlockerDefusing: antiBlockerDefusing.checked,
    strictBlocking: strictBlocking.checked,
  });
  saved.textContent = 'Saved.';
  setTimeout(() => { saved.textContent = ''; }, 3000);
});

// Mirrors serializeSettings()/parseSettingsBackup() from @privacy-shield/storage.
const BACKUP_KEYS = [
  'enabled', 'filterLists', 'customFilterLists', 'customRulesText',
  'cookieProtection', 'scriptControl', 'webRtcProtection', 'antiBlockerDefusing',
  'strictBlocking', 'siteSettings', 'disabledSites', 'customCosmetic',
  'whitelist', 'dynamicRules', 'extendedRules',
];

function backupMessage(text) {
  const el = document.getElementById('backupMessage');
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; }, 5000);
}

document.getElementById('exportSettings').addEventListener('click', async () => {
  const stored = await browser.storage.local.get(BACKUP_KEYS);
  const backup = {
    format: 'privacy-shield-settings', version: 1, exportedAt: Date.now(), settings: stored,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `privacy-shield-settings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  backupMessage('Settings exported.');
});

document.getElementById('importSettings').addEventListener('click', async () => {
  const file = document.getElementById('importSettingsFile').files[0];
  if (!file) { backupMessage('Choose a JSON backup first.'); return; }
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed.format !== 'privacy-shield-settings' || parsed.version !== 1 ||
        !parsed.settings || typeof parsed.settings !== 'object') {
      throw new Error('Unsupported backup format');
    }
    const clean = {};
    for (const key of BACKUP_KEYS) {
      if (Object.prototype.hasOwnProperty.call(parsed.settings, key)) clean[key] = parsed.settings[key];
    }
    await browser.storage.local.set(clean);
    backupMessage('Settings restored.');
    await load();
  } catch (error) {
    backupMessage(`Import failed: ${error.message}`);
  }
});

clearLog.addEventListener('click', async () => {
  await browser.storage.local.set({ requestLog: [] });
  renderLog([]);
});

browser.storage.onChanged.addListener((changes) => {
  if (
    changes.filterLists || changes.customFilterLists || changes.filterListStatus ||
    changes.cookieProtection || changes.scriptControl || changes.siteSettings ||
    changes.disabledSites || changes.requestLog || changes.customCosmetic || changes.whitelist ||
    changes.unsupportedRules || changes.dynamicRules || changes.customRulesText || changes.dnrQuotaNotice
  ) {
    load();
  }
});

load();
