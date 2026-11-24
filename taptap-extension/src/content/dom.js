// DOM helpers for reading what an element *is*.
// Adapted from bopbop's page agent (MIT, github.com/alexsorokoletov/bopbop, prototype/src/page/agent.js):
// role(), accName(), textOf(), isVisible(), deepQueryAll(). Kept small on purpose — the annotation
// engine needs a good name for an element, not a full snapshot format.

export const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const TAG_ROLES = {
  button: 'button',
  textarea: 'textbox',
  nav: 'navigation',
  main: 'main',
  form: 'form',
  dialog: 'dialog',
  ul: 'list',
  ol: 'list',
  menu: 'list',
  table: 'table',
  tr: 'row',
  th: 'columnheader',
  td: 'cell',
  option: 'option',
  summary: 'button',
  fieldset: 'group',
  iframe: 'iframe',
  frame: 'iframe',
  canvas: 'canvas',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  search: 'search',
};

const INPUT_ROLES = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  file: 'file',
  color: 'colorpicker',
  date: 'date',
  'datetime-local': 'date',
  time: 'date',
  month: 'date',
  week: 'date',
};

const NAME_FROM_CONTENT = new Set([
  'link',
  'button',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'treeitem',
  'heading',
  'clickable',
  'cell',
  'columnheader',
  'switch',
  'checkbox',
  'radio',
]);

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'svg', 'path']);

export function role(el) {
  const explicit = el.getAttribute?.('role');
  if (explicit) return explicit.split(/\s+/)[0];
  const t = el.localName;
  if (t === 'a' || t === 'area') return el.hasAttribute('href') ? 'link' : null;
  if (t === 'input') {
    if (el.type === 'hidden') return null;
    return INPUT_ROLES[el.type] || 'textbox';
  }
  if (t === 'select') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
  if (t === 'img') return el.getAttribute('alt') === '' ? null : 'img';
  if (TAG_ROLES[t]) return TAG_ROLES[t];
  if (el.isContentEditable && !el.parentElement?.isContentEditable) return 'textbox';
  if (el.getAttribute('draggable') === 'true') return 'draggable';
  return null;
}

/** Composed-tree children: shadow content, slot assignments, then light DOM. */
export function children(node) {
  if (node.shadowRoot) return [...node.shadowRoot.childNodes];
  if (node.localName === 'slot') {
    const assigned = node.assignedNodes({ flatten: true });
    return assigned.length ? assigned : [...node.childNodes];
  }
  return [...node.childNodes];
}

export function textOf(node, max = 200) {
  let out = '';
  const walk = (n) => {
    if (out.length > max) return;
    if (n.nodeType === 3) {
      out += n.data;
      return;
    }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    if (n.nodeType === 1) {
      if (SKIP_TAGS.has(n.localName) || n.localName === 'select' || n.localName === 'datalist') return;
      if (n.getAttribute('aria-hidden') === 'true') return;
      if (n.localName === 'img') {
        out += ' ' + (n.getAttribute('alt') || '') + ' ';
        return;
      }
      if (n.localName === 'input' && ['submit', 'button'].includes(n.type)) {
        out += ' ' + n.value + ' ';
        return;
      }
    }
    for (const c of children(n)) walk(c);
  };
  walk(node);
  return norm(out);
}

function byId(el, id) {
  const root = el.getRootNode();
  return (root.getElementById ? root.getElementById(id) : null) || document.getElementById(id);
}

export function accName(el, r = role(el)) {
  let n = el.getAttribute('aria-label');
  if (!n) {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      n = lb
        .split(/\s+/)
        .map((id) => textOf(byId(el, id) || document.createElement('i')))
        .join(' ');
    }
  }
  if (!n && el.labels?.length) n = [...el.labels].map((l) => textOf(l)).join(' ');
  if (!n && el.localName === 'img') n = el.getAttribute('alt');
  if (!n && el.localName === 'input' && ['submit', 'button', 'reset'].includes(el.type)) n = el.value || el.type;
  if (!n && el.localName === 'fieldset') n = textOf(el.querySelector('legend') || document.createElement('i'));
  if (!n && el.localName === 'table') n = textOf(el.querySelector('caption') || document.createElement('i'));
  if (!n && NAME_FROM_CONTENT.has(r)) n = textOf(el);
  if (!n) n = el.getAttribute('title') || '';
  return clip(norm(n), 80);
}

/** True for elements with a box the user can actually see. */
export function isVisible(el) {
  if (el.getAttribute?.('aria-hidden') === 'true') return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'contents') return true;
  if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  if (rect.width <= 1 && rect.height <= 1 && (cs.position === 'absolute' || cs.position === 'fixed')) return false;
  if (parseFloat(cs.fontSize) === 0) return false;
  return true;
}

/** querySelectorAll that also looks inside open shadow roots. */
export function deepQueryAll(sel, root = document) {
  const out = [];
  let nodes;
  try {
    nodes = root.querySelectorAll(sel);
  } catch {
    return out;
  }
  for (const e of nodes) out.push(e);
  for (const e of root.querySelectorAll('*')) {
    if (e.shadowRoot) out.push(...deepQueryAll(sel, e.shadowRoot));
  }
  return out;
}

/** CSS.escape with a fallback for the rare page that shadows it. */
export function escapeIdent(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
}
