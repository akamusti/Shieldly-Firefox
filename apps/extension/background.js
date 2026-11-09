browser.runtime.onInstalled.addListener(async () => {
  const { enabled } = await browser.storage.local.get('enabled');
  if (enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0 });
  }
  console.log('Privacy Shield (Firefox) installed.');
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'incrementBlocked') {
    return browser.storage.local.get('blocked').then(({ blocked = 0 }) => {
      return browser.storage.local.set({ blocked: blocked + 1 }).then(() => ({ ok: true }));
    });
  }
});