(function () {
  const STYLE_ID = 'privacy-shield-cosmetic';
  let lastCss = '';

  function matchesHost(entryHost, host) {
    return host === entryHost || host.endsWith('.' + entryHost);
  }

  async function apply() {
    const { enabled = true, disabledSites = [], cosmeticSelectors = [] } = await browser.storage.local.get(['enabled', 'disabledSites', 'cosmeticSelectors']);
    const host = location.hostname;
    const siteDisabled = disabledSites.includes(host);
    const shouldApply = enabled && !siteDisabled;

    let style = document.getElementById(STYLE_ID);
    if (!shouldApply) {
      if (style) style.remove();
      lastCss = '';
      return;
    }
    const selectors = [];
    for (const entry of cosmeticSelectors) {
      const idx = entry.indexOf('##');
      if (idx < 0) continue;
      const entryHost = entry.slice(0, idx);
      const selector = entry.slice(idx + 2);
      if (matchesHost(entryHost, host)) selectors.push(selector);
    }
    const css = selectors.map((s) => `${s} { display: none !important; }`).join('\n');
    if (css === lastCss) return;
    lastCss = css;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = css;
  }

  apply();
  browser.storage.onChanged.addListener((changes) => {
    if (changes.enabled || changes.disabledSites || changes.cosmeticSelectors) {
      apply();
    }
  });
})();