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
    if (changes.enabled || changes.disabledSites || changes.cosmeticSelectors || changes.customCosmetic) {
      apply();
    }
  });

  // Element picker.
  let picking = false;
  let highlight = null;

  function selectorFor(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const cls = Array.from(el.classList).filter(Boolean).slice(0, 2);
    if (cls.length) return `${el.tagName.toLowerCase()}.${cls.map(CSS.escape).join('.')}`;
    let path = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (siblings.length > 1) path += `:nth-of-type(${siblings.indexOf(el) + 1})`;
    }
    return path;
  }

  function stopPicker() {
    picking = false;
    if (highlight) { highlight.remove(); highlight = null; }
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('click', onClick, true);
  }

  function onOver(e) {
    if (!picking) return;
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7dd3fc;background:rgba(125,211,252,0.15);';
      document.documentElement.appendChild(highlight);
    }
    const r = e.target.getBoundingClientRect();
    highlight.style.top = `${r.top}px`;
    highlight.style.left = `${r.left}px`;
    highlight.style.width = `${r.width}px`;
    highlight.style.height = `${r.height}px`;
  }

  async function onClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    const selector = selectorFor(e.target);
    const host = location.hostname;
    const { customCosmetic = [] } = await browser.storage.local.get('customCosmetic');
    await browser.storage.local.set({ customCosmetic: Array.from(new Set([...customCosmetic, `${host}##${selector}`])) });
    stopPicker();
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'startPicker') {
      picking = true;
      document.addEventListener('mouseover', onOver, true);
      document.addEventListener('click', onClick, true);
    }
  });

  browser.storage.local.get('customCosmetic').then(({ customCosmetic = [] }) => {
    if (!customCosmetic.length) return;
    const host = location.hostname;
    const selectors = customCosmetic
      .filter((entry) => entry.startsWith(host + '##'))
      .map((entry) => entry.slice(entry.indexOf('##') + 2));
    if (!selectors.length) return;
    const css = selectors.map((s) => `${s} { display: none !important; }`).join('\n');
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  });
})();