import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// The element picker lives in the content script. It is extracted and run
// against a small fake DOM so the selector generator is covered without a
// browser.
const source = readFileSync(new URL('../apps/extension/content.js', import.meta.url), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `section exists: ${startMarker}`);
  return source.slice(start, end);
}

const cssSection = slice('  function cssAttributeValue(value) {', '  function isUsableSelector');
const pickerSection = slice('  // --- element picker', '  function stopPicker()');

function createElement(tag, options = {}) {
  const element = {
    tagName: tag.toUpperCase(),
    id: options.id || '',
    classList: [...(options.classes || [])],
    attributes: Object.entries(options.attrs || {}).map(([name, value]) => ({ name, value })),
    children: [],
    parentElement: null,
  };
  for (const child of options.children || []) {
    element.children.push(child);
    child.parentElement = element;
  }
  return element;
}

function unescapeCss(value) {
  return value
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1');
}

function parseSimple(selector) {
  const parsed = { tag: null, id: null, classes: [], attrs: [], nth: null };
  let rest = selector.trim();
  const nth = rest.match(/:nth-of-type\((\d+)\)$/);
  if (nth) {
    parsed.nth = Number(nth[1]);
    rest = rest.slice(0, nth.index);
  }
  const attrPattern = /\[([^\]=]+)="([^"]*)"\]/g;
  let match;
  while ((match = attrPattern.exec(rest))) parsed.attrs.push([match[1], match[2]]);
  rest = rest.replace(/\[[^\]]*\]/g, '');
  const id = rest.match(/#([^.#]+)/);
  if (id) {
    parsed.id = unescapeCss(id[1]);
    rest = rest.replace(/#[^.#]+/, '');
  }
  const classPattern = /\.([\w-]+)/g;
  while ((match = classPattern.exec(rest))) parsed.classes.push(unescapeCss(match[1]));
  rest = rest.replace(/\.[\w-]+/g, '');
  if (rest) parsed.tag = rest.toLowerCase();
  return parsed;
}

function matchesSimple(element, parsed) {
  if (parsed.tag && element.tagName.toLowerCase() !== parsed.tag) return false;
  if (parsed.id && element.id !== parsed.id) return false;
  for (const className of parsed.classes) {
    if (!element.classList.includes(className)) return false;
  }
  for (const [name, value] of parsed.attrs) {
    const attribute = element.attributes.find((entry) => entry.name === name);
    if (!attribute || attribute.value !== value) return false;
  }
  if (parsed.nth) {
    const parent = element.parentElement;
    if (!parent) return false;
    const siblings = parent.children.filter((child) => child.tagName === element.tagName);
    if (siblings.indexOf(element) + 1 !== parsed.nth) return false;
  }
  return true;
}

// The generated selector reads "element > parent > ancestor".
function matchesChain(element, parts) {
  let current = element;
  for (const part of parts) {
    if (!current || !matchesSimple(current, parseSimple(part))) return false;
    current = current.parentElement;
  }
  return true;
}

function collect(element, out = []) {
  out.push(element);
  for (const child of element.children) collect(child, out);
  return out;
}

function runPicker(root) {
  const all = collect(root);
  const document = {
    querySelectorAll: (selector) => {
      const parts = selector.split(/\s>\s/).map((part) => part.trim());
      return all.filter((element) => matchesChain(element, parts));
    },
  };
  const context = { document, CSS: { escape: (value) => value } };
  vm.runInNewContext(
    `${cssSection}
${pickerSection}
globalThis.makeSelector = makeSelector;`,
    context,
  );
  return context.makeSelector;
}

test('uses a unique id when the element has one', () => {
  const ad = createElement('div', { id: 'ad-slot', classes: ['banner'] });
  const root = createElement('body', { children: [ad] });
  assert.equal(runPicker(root)(ad), '#ad-slot');
});

test('falls back to classes when the id is not unique', () => {
  const first = createElement('div', { id: 'dup', classes: ['ad-slot'] });
  const second = createElement('div', { id: 'dup', classes: ['ad-slot'] });
  const root = createElement('body', { children: [first, second] });
  // Neither id nor the class combination is unique, so the generator walks up.
  const selector = runPicker(root)(first);
  assert.match(selector, /^div:nth-of-type\(1\)/);
});

test('uses a stable data attribute when classes are generated', () => {
  const ad = createElement('div', { classes: ['css-1x2y3z'], attrs: { 'data-ad': 'top' } });
  const root = createElement('body', { children: [ad] });
  assert.equal(runPicker(root)(ad), 'div[data-ad="top"]');
});

test('escapes ids that would break the selector', () => {
  const ad = createElement('div', { id: '1st:ad' });
  const root = createElement('body', { children: [ad] });
  assert.equal(runPicker(root)(ad), '#\\31 st\\:ad');
});

test('builds a parent path when nothing else is unique', () => {
  const target = createElement('span', {});
  const twin = createElement('span', {});
  const section = createElement('section', { id: 'ad-a', children: [target] });
  const other = createElement('section', { children: [twin] });
  const root = createElement('body', { children: [section, other] });
  // "span" matches twice, so the generator anchors on the ancestor id.
  assert.equal(runPicker(root)(target), 'span > #ad-a');
});
