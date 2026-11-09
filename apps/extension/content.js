(function () {
  const STYLE_ID = 'privacy-shield-cosmetic';

  async function apply() {
    const { enabled = true, disabledSites = [], cosmeticSelectors = [] } = await browser.storage.local.get(['enabled', 'disabledSites', 'cosmeticSelectors']);
    const host = location.hostname;
    const siteDisabled = disabledSites.includes(host);
    const shouldApply = enabled && !siteDisabled;

    let style = document.getElementById(STYLE_ID);
    if (!shouldApply) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = cosmeticSelectors.map((s) => `${s} { display: none !important; }`).join('\n');
  }

  apply();
  browser.storage.onChanged.addListener(() => apply());
})();