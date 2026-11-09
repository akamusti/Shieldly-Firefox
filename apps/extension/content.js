(function () {
  const STYLE_ID = 'privacy-shield-cosmetic';
  let lastCss = '';

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
    const css = cosmeticSelectors.map((s) => `${s} { display: none !important; }`).join('\n');
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