import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// The "block element" flow lives in the content script. It is extracted and
// run with small fakes so the rule format and the storage round-trip are
// covered without a browser.
const source = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `section exists: ${startMarker}`);
  return source.slice(start, end);
}

const blockSection = slice('  // --- user rules', '  // --- toast');

function setup(overrides = {}) {
  const listeners = {};
  const stored = {};
  const toasts = [];

  const context = {
    host: 'ads.example',
    state: { active: true, specific: [] },
    stateLoaded: true,
    postDomDone: true,
    rendered: [],
    makeSelector: () => 'div.ad-banner',
    showToast: (message, actionLabel) => toasts.push({ message, actionLabel }),
    render: (includeGeneric) => context.rendered.push(includeGeneric),
    document: {
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
    },
    api: {
      storage: {
        local: {
          get: async (key) => (key in stored ? { [key]: stored[key] } : {}),
          set: async (values) => {
            Object.assign(stored, values);
          },
        },
      },
    },
    ...overrides,
  };
  context.stored = stored;
  context.listeners = listeners;
  context.toasts = toasts;

  vm.runInNewContext(
    `${blockSection}
globalThis.blockElement = blockElement;`,
    context,
  );
  return context;
}

test('stores a site-specific rule for the right-clicked element', async () => {
  const context = setup();
  const element = { nodeType: 1, isConnected: true };

  context.listeners.contextmenu({ target: element, composedPath: () => [element] });
  const result = await context.blockElement();

  assert.deepEqual({ ...result }, { ok: true, selector: 'div.ad-banner' });
  assert.deepEqual([...context.stored.customCosmetic], ['ads.example##div.ad-banner']);
  assert.deepEqual([...context.state.specific], ['div.ad-banner']);
  assert.equal(context.toasts[0].message, 'Element blocked');
  assert.equal(context.toasts[0].actionLabel, 'Undo');
});

test('does not store the same rule twice', async () => {
  const context = setup();
  const element = { nodeType: 1, isConnected: true };
  context.listeners.contextmenu({ target: element, composedPath: () => [element] });

  await context.blockElement();
  await context.blockElement();

  assert.deepEqual([...context.stored.customCosmetic], ['ads.example##div.ad-banner']);
});

test('reports a missing target instead of blocking something random', async () => {
  const context = setup();
  const result = await context.blockElement();
  assert.deepEqual({ ...result }, { ok: false, reason: 'no-target' });
  assert.equal(context.stored.customCosmetic, undefined);
});

test('reports paused protection instead of hiding the element', async () => {
  const context = setup({ state: { active: false, specific: [] } });
  const element = { nodeType: 1, isConnected: true };
  context.listeners.contextmenu({ target: element, composedPath: () => [element] });

  const result = await context.blockElement();

  assert.deepEqual({ ...result }, { ok: false, reason: 'disabled' });
  assert.equal(context.stored.customCosmetic, undefined);
  assert.equal(context.toasts[0].message, 'Protection is paused on this site');
});
