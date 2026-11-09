const toggle = document.getElementById('toggle');
const countEl = document.getElementById('count');

async function load() {
  const { enabled = true, blocked = 0 } = await browser.storage.local.get(['enabled', 'blocked']);
  toggle.textContent = enabled ? 'On' : 'Off';
  countEl.textContent = String(blocked);
}

toggle.addEventListener('click', async () => {
  const { enabled = true } = await browser.storage.local.get('enabled');
  const next = !enabled;
  await browser.storage.local.set({ enabled: next });
  toggle.textContent = next ? 'On' : 'Off';
});

load();