const BLOCKED_DOMAINS = ['doubleclick.net', 'googlesyndication.com'];

browser.runtime.onInstalled.addListener(async () => {
  const { enabled } = await browser.storage.local.get('enabled');
  if (enabled === undefined) {
    await browser.storage.local.set({ enabled: true, blocked: 0 });
  }
  console.log('Privacy Shield (Firefox) installed.');
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url = new URL(details.url);
      if (BLOCKED_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith('.' + d))) {
        browser.storage.local.get('blocked').then(({ blocked = 0 }) => {
          browser.storage.local.set({ blocked: blocked + 1 });
        });
        return { cancel: true };
      }
    } catch (e) {}
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);