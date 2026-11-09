const easylist = document.getElementById('easylist');
const easyprivacy = document.getElementById('easyprivacy');
const customRules = document.getElementById('customRules');
const save = document.getElementById('save');
const saved = document.getElementById('saved');

async function load() {
  const { filterLists = { easylist: true, easyprivacy: true }, customRulesText = '', cookieProtection = true, scriptControl = false } =
    await browser.storage.local.get(['filterLists', 'customRulesText', 'cookieProtection', 'scriptControl']);
  easylist.checked = filterLists.easylist !== false;
  easyprivacy.checked = filterLists.easyprivacy !== false;
  customRules.value = customRulesText;
  document.getElementById('cookieProtection').checked = cookieProtection !== false;
  document.getElementById('scriptControl').checked = scriptControl === true;
}

save.addEventListener('click', async () => {
  await browser.storage.local.set({
    filterLists: { easylist: easylist.checked, easyprivacy: easyprivacy.checked },
    customRulesText: customRules.value,
    cookieProtection: document.getElementById('cookieProtection').checked,
    scriptControl: document.getElementById('scriptControl').checked,
  });
  saved.textContent = 'Saved. Reload the extension to rebuild rules.';
  setTimeout(() => { saved.textContent = ''; }, 3000);
});

const logEl = document.getElementById('log');
const clearLog = document.getElementById('clearLog');

async function renderLog() {
  const { requestLog = [] } = await browser.storage.local.get('requestLog');
  logEl.innerHTML = '';
  for (const entry of requestLog.slice(0, 100)) {
    const li = document.createElement('li');
    li.textContent = `${new Date(entry.time).toLocaleTimeString()} — ${entry.url}`;
    logEl.appendChild(li);
  }
}

clearLog.addEventListener('click', async () => {
  await browser.storage.local.set({ requestLog: [] });
  renderLog();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.requestLog) renderLog();
});

load();
renderLog();