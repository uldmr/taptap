// Turning an element into something a human and an agent can both name:
// a short attribute digest for the card, and an ordered list of ways to find it again.

import { accName, clip, deepQueryAll, escapeIdent, norm, role, textOf } from './dom.js';

const TESTID_ATTRS = ['data-testid', 'data-test', 'data-test-id', 'data-cy', 'data-qa', 'data-pw', 'data-e2e'];

// Classes that carry a build hash or are atomic CSS-in-JS output. They look like
// selectors but change on every deploy, so they never anchor anything.
const ATOMIC = /^(css|sc|jsx|emotion|styled|svelte|astro|tw)-[\w-]*[\dA-Z][\w-]*$/;

/** The part of a class name that survives a rebuild, or null when nothing does. */
export function localClass(name) {
  const cssModule = name.match(/^([A-Za-z][\w-]*?)(__|--)([\w-]{4,})$/);
  if (cssModule) return cssModule[1];
  if (ATOMIC.test(name)) return null;
  if (/^[a-z][a-z0-9]?_[a-z0-9]{5,}$/i.test(name)) return null; // emotion / goober
  return name;
}

/** Stable class names of an element: deduped, hash stripped, page-order kept. */
export function classTokens(el) {
  const out = [];
  for (const raw of el.classList || []) {
    const local = localClass(raw);
    if (local && !out.includes(local)) out.push(local);
  }
  return out;
}

// Tailwind variants (`@md:text-heading-64`) and arbitrary values (`w-[42px]`) are
// valid classes but make a selector that is hard to read and easy to break, so a
// selector only ever uses plain identifiers.
const PLAIN_CLASS = /^[A-Za-z][\w-]*$/;

export function selectorClasses(el) {
  return classTokens(el).filter((c) => PLAIN_CLASS.test(c));
}

const attrString = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');

function count(selector, root = document) {
  try {
    return deepQueryAll(selector, root);
  } catch {
    return [];
  }
}

function nthOfType(el) {
  let n = 0;
  let sib = el;
  while (sib) {
    if (sib.localName === el.localName) n++;
    sib = sib.previousElementSibling;
  }
  return n;
}

/** A stable-ish DOM path: tag plus index among same-tag siblings, from body down. */
export function pathOf(el, maxDepth = 8) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < maxDepth) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
      parts.unshift('#' + escapeIdent(node.id));
      break;
    }
    parts.unshift(`${node.localName}:nth-of-type(${nthOfType(node)})`);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** Best single selector we can print in a prompt for this element. */
export function selectorOf(el) {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return '#' + escapeIdent(el.id);
  for (const attr of TESTID_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) return `[${attr}="${attrString(v)}"]`;
  }
  const name = el.getAttribute('name');
  if (name) return `${el.localName}[name="${attrString(name)}"]`;
  const label = el.getAttribute('aria-label');
  if (label) return `${el.localName}[aria-label="${attrString(label)}"]`;
  const classes = selectorClasses(el).slice(0, 2);
  if (classes.length) return el.localName + classes.map((c) => `.${escapeIdent(c)}`).join('');
  return pathOf(el, 6);
}

function htmlOf(el, max = 300) {
  const clone = el.cloneNode(false);
  clone.textContent = '';
  for (const child of el.children) {
    if (clone.outerHTML.length > max / 2) break;
    clone.append(child.cloneNode(false));
  }
  return clip(norm(clone.outerHTML), max);
}

/**
 * Everything the card and the prompt show about one element.
 * `stack` comes from stack.js: { name, component, parentComponent, ... }.
 */
export function describe(el, stack = {}) {
  const r = role(el);
  const parent = el.parentElement;
  const classes = classTokens(el);
  const testidAttr = TESTID_ATTRS.find((a) => el.getAttribute(a));

  return {
    tag: el.localName,
    id: el.id || '',
    name: el.getAttribute('name') || '',
    type: el.getAttribute('type') || '',
    role: r || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    testid: testidAttr ? el.getAttribute(testidAttr) : '',
    testidAttr: testidAttr || '',
    classes,
    classCount: (el.classList || []).length,
    text: clip(norm(textOf(el, 160)), 120),
    html: htmlOf(el),
    path: pathOf(el),
    selector: selectorOf(el),
    accessibleName: accName(el, r),
    visible: el.getBoundingClientRect().width > 0,
    parent: parent
      ? {
          tag: parent.localName,
          id: parent.id || '',
          selector: selectorOf(parent),
          classes: classTokens(parent).slice(0, 3),
          component: stack.parentComponent || '',
        }
      : null,
    stack: stack.framework || stack.name || '',
    component: stack.component || stack.chain?.[0] || '',
    componentChain: stack.chain || [],
    stackVersion: stack.version || '',
  };
}

/**
 * Ordered anchor candidates for this element, most trustworthy first.
 * Stage 2 resolves them again after reload; the order is the whole strategy:
 * a stable id beats a test id, a test id beats an attribute, an attribute beats
 * a class, a class beats a text fingerprint, and a positional path is last.
 *
 * `index` is the element's position among the matches at capture time, used to
 * disambiguate candidates that are legitimately repeated (lists, cards).
 */
export function candidates(el) {
  const out = [];
  const push = (kind, selector, allowed = 1) => {
    const found = count(selector);
    if (!found.length || found.length > 50) return;
    const index = found.indexOf(el);
    if (index < 0) return;
    if (found.length > 1 && index >= allowed) return;
    out.push({ kind, selector, index, total: found.length });
  };

  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) push('id', '#' + escapeIdent(el.id));

  for (const attr of TESTID_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) push('testid', `[${attr}="${attrString(v)}"]`);
  }

  const name = el.getAttribute('name');
  if (name) push('name', `${el.localName}[name="${attrString(name)}"]`);

  const label = el.getAttribute('aria-label');
  if (label) push('label', `${el.localName}[aria-label="${attrString(label)}"]`);

  const r = role(el);
  const accNameText = accName(el, r);
  if (r && accNameText) {
    push('role-name', `[role="${attrString(r)}"][aria-label="${attrString(accNameText)}"]`);
  }

  if (el.localName === 'a' && el.getAttribute('href')?.startsWith('/')) {
    push('href', `a[href="${attrString(el.getAttribute('href'))}"]`);
  }

  const classes = selectorClasses(el).slice(0, 2);
  if (classes.length) {
    push('class', `${el.localName}${classes.map((c) => `[class*="${attrString(c)}"]`).join('')}`);
  }

  push('path', pathOf(el), Infinity);

  return out;
}

/** Fingerprint used to check that a re-resolved element is the same one. */
export function fingerprint(el) {
  return {
    tag: el.localName,
    role: role(el) || '',
    name: accName(el) || '',
    text: clip(norm(textOf(el, 120)), 80),
  };
}
