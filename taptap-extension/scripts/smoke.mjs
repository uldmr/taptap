// End-to-end smoke test: real Chrome, the real extension, a real page.
// Activates the mode through the service worker, taps an element, types a prompt,
// saves, reloads the page, and checks the annotation came back and the prompt is
// built. Run with `npm run smoke`; it prints a check table and exits non-zero on
// a failure. Screenshots land in .tmp/smoke/ for a look.

import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const shots = join(root, '.tmp/smoke');

// Google Chrome (branded) refuses --load-extension since 137, so the test needs a
// Chrome for Testing / Chromium build. Playwright's cache usually already has one.
function resolveBrowser() {
  const home = process.env.HOME || '';
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ];
  const cache = join(home, 'Library/Caches/ms-playwright');
  try {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      const base = join(cache, dir);
      for (const arch of readdirSync(base)) {
        candidates.push(join(base, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
        candidates.push(join(base, arch, 'Chromium.app/Contents/MacOS/Chromium'));
      }
    }
  } catch {}
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) {
    console.error('No Chromium/Chrome for Testing found. Install one with:');
    console.error('  npx @puppeteer/browsers install chrome@stable');
    console.error('or point CHROME_PATH at a Chromium binary.');
    process.exit(1);
  }
  return found;
}

const CHROME = resolveBrowser();

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ is missing — run `npm run build` first');
  process.exit(1);
}

const FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Checkout — Taptap fixture</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: #fff; color: #111; }
  header { padding: 24px; border-bottom: 1px solid #e5e7eb; }
  h1 { margin: 0 0 16px; font-size: 22px; }
  form { display: flex; gap: 8px; }
  input { width: 320px; padding: 10px 12px; font-size: 15px; border: 1px solid #cbd5e1; border-radius: 8px; }
  button { padding: 10px 16px; font-size: 15px; border: 0; border-radius: 8px; background: #0ea5e9; color: #fff; }
  main { padding: 40px 24px; max-width: 640px; }
  .Intro_text__q9Xyz { color: #334155; }
</style></head>
<body>
  <header class="Header_header__x5dIN">
    <h1 id="title">Taptap fixture</h1>
    <form data-testid="search-form" role="search" class="HeaderSearch_form__VSV_n">
      <input id="q" data-testid="home-search-input" name="q" type="search"
             aria-label="Search stays, villas and hotels" placeholder="Search stays, villas and hotels">
      <button type="submit" data-testid="search-submit">Search</button>
    </form>
  </header>
  <main class="Checkout_main__a1b2">
    <p class="Intro_text__q9Xyz">This copy is here so there is something worth rewriting.</p>
  </main>
</body></html>`;

const REACT_FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Hotel — Taptap fixture</title>
<style>body { margin:0; font:16px/1.5 system-ui, sans-serif; } #root { padding: 40px; } .PriceCard_card__a1b2 { padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 320px; }</style>
</head><body><div id="root"></div>
<script>
  // A page-world React shape: the fiber chain and the devtools hook are exactly
  // what the probe reads, without shipping React to the test.
  function PriceCard() {}
  function HotelPage() {}
  const card = document.createElement('div');
  card.id = 'price';
  card.className = 'PriceCard_card__a1b2';
  card.setAttribute('data-testid', 'price-card');
  card.textContent = '€129 per night';
  document.getElementById('root').append(card);
  card['__reactFiber$t4pt4p'] = { type: PriceCard, return: { type: HotelPage, return: null } };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new Map([[1, { version: '19.1.0' }]]) };
</script></body></html>`;

// --- chrome -----------------------------------------------------------------

const profile = join(process.env.TMPDIR || '/tmp', `taptap-smoke-${process.pid}`);
rmSync(profile, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url.startsWith('/react') ? REACT_FIXTURE : FIXTURE);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = `${origin}/checkout`;

const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter',
    '--window-size=1280,900',
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--load-extension=${dist}`,
    `--disable-extensions-except=${dist}`,
    pageUrl,
  ],
  { stdio: 'ignore' },
);

const cleanup = () => {
  try {
    chrome.kill('SIGKILL');
  } catch {}
  server.close();
  rmSync(profile, { recursive: true, force: true });
};
process.on('exit', cleanup);

async function browserWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await res.json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error('Chrome did not open a debugging port');
}

// --- tiny CDP client --------------------------------------------------------

function client(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let seq = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(`${msg.error.message} (${slot.method})`));
    else slot.resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return { ready, send, close: () => ws.close() };
}

const cdp = client(await browserWs());
await cdp.ready;

const findTarget = async (predicate, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const hit = targetInfos.find(predicate);
    if (hit) return hit;
    await sleep(150);
  }
  return null;
};

const swTarget = await findTarget(
  (t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') && t.url.endsWith('/sw.js'),
);
if (!swTarget) throw new Error('extension service worker never appeared');
const extensionId = new URL(swTarget.url).host;

const pageTarget = await findTarget((t) => t.type === 'page' && t.url.startsWith(pageUrl.split('/checkout')[0]));
if (!pageTarget) throw new Error('fixture page never appeared');

const sw = (await cdp.send('Target.attachToTarget', { targetId: swTarget.targetId, flatten: true })).sessionId;
const page = (await cdp.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true })).sessionId;

await cdp.send('Page.enable', {}, page);
await cdp.send('DOM.enable', {}, page);
await cdp.send('Runtime.enable', {}, page);

const evalPage = async (expression) => {
  const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page);
  if (res.exceptionDetails) throw new Error(`page eval failed: ${res.exceptionDetails.text}`);
  return res.result.value;
};

const evalSw = async (expression) => {
  const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sw);
  if (res.exceptionDetails) throw new Error(`sw eval failed: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ''}`);
  return res.result.value;
};

const waitFor = async (fn, timeout = 4000, step = 100) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await fn();
    if (value) return value;
    await sleep(step);
  }
  return null;
};

// --- DOM helpers over CDP (closed shadow roots included) --------------------

async function tree() {
  return cdp.send('DOM.getDocument', { depth: -1, pierce: true }, page);
}

function walk(node, out = []) {
  out.push(node);
  for (const child of node.children || []) walk(child, out);
  for (const root of node.shadowRoots || []) walk(root, out);
  return out;
}

function classOf(node) {
  const attrs = node.attributes || [];
  for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === 'class') return attrs[i + 1];
  return '';
}

async function find(className) {
  const { root } = await tree();
  return walk(root).find((n) => n.nodeType === 1 && classOf(n).split(/\s+/).includes(className)) || null;
}

async function findAll(className) {
  const { root } = await tree();
  return walk(root).filter((n) => n.nodeType === 1 && classOf(n).split(/\s+/).includes(className));
}

async function html(node) {
  return (await cdp.send('DOM.getOuterHTML', { nodeId: node.nodeId }, page)).outerHTML;
}

async function prop(node, expression) {
  const { object } = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId }, page);
  const res = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: expression, returnByValue: true }, page);
  return res.result.value;
}

async function clickNode(node) {
  if (!node) throw new Error('clickNode: node not found');
  await prop(node, 'function(){ this.click(); return true }');
}

// --- checks -----------------------------------------------------------------

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const center = async (selector) =>
  evalPage(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);

const move = (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }, page);
const click = async (x, y) => {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, page);
};

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, page);
  writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
};

await cdp.send('Page.navigate', { url: pageUrl }, page);
await sleep(600);

// 1. dormant: no overlay before activation
check('dormant page has no overlay', (await find('frame')) === null);

// 2. activate the way the toolbar does it: flag in session storage, then tell the page
const activated = await evalSw(`(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return 'no tab';
  const got = await chrome.storage.session.get('taptap:active-tabs');
  const map = got['taptap:active-tabs'] || {};
  map[tab.id] = true;
  await chrome.storage.session.set({ 'taptap:active-tabs': map });
  try { await chrome.tabs.sendMessage(tab.id, { type: 'taptap:set-active', active: true }); return 'sent'; }
  catch (e) { return String(e); }
})()`);
check('service worker reaches the page', activated === 'sent', activated);

const frame = await waitFor(() => find('frame'));
check('annotation mode shows the viewport frame', !!frame);
check('cursor is replaced', (await evalPage(`document.documentElement.classList.contains('__taptap_cursor')`)) === true);
check('page cursor css is injected', (await evalPage(`!!document.getElementById('taptap-cursor-style')`)) === true);

// 3. hover highlights the element under the pointer
const input = await center('[data-testid="home-search-input"]');
await move(input.x, input.y);
const hoverLabel = await waitFor(async () => {
  const node = await find('hover-label');
  return node ? prop(node, 'function(){ return this.textContent }') : null;
});
check('hover shows the element label', /input/.test(hoverLabel || ''), hoverLabel || 'no label');

// 4. click opens a card with the element's attributes
check('page click still navigates nothing', (await evalPage('location.pathname')) === '/checkout');
await click(input.x, input.y);
const card = await waitFor(() => find('card'));
check('click opens the annotation card', !!card);

const cardHtml = card ? await html(card) : '';
check('card names the test id', cardHtml.includes('home-search-input'));
check('card shows the role', cardHtml.includes('searchbox'));
check('card shows the input type', cardHtml.includes('type'));
await shot('01-card');

// 5. typing a prompt and saving
await cdp.send('Input.insertText', { text: 'Make the placeholder shorter and drop the rounded corners.' }, page);
const saveBtn = await find('btn-primary');
check('save button exists', !!saveBtn);
await clickNode(saveBtn);
await sleep(250);

const hudCount = await waitFor(async () => {
  const node = await find('count');
  return node ? prop(node, 'function(){ return this.textContent }') : null;
});
check('hud counts the annotation', hudCount === '1', hudCount || 'no count');
check('marker is drawn on the element', (await findAll('marker')).length === 1);

// 6. a second element, anchored by its test id (no id attribute on it)
const submitButton = await center('[data-testid="search-submit"]');
await move(submitButton.x, submitButton.y);
await click(submitButton.x, submitButton.y);
const card2 = await waitFor(() => find('card'));
check('second element opens a card', !!card2);
check('clicking a submit button did not submit the form', (await evalPage('location.search')) === '');
await cdp.send('Input.insertText', { text: 'Make this button say "Find stays" and use the brand colour.' }, page);
await clickNode(await find('btn-primary'));
await sleep(300);
check('hud counts both', (await prop(await find('count'), 'function(){ return this.textContent }')) === '2');

const stored = await evalSw(`chrome.storage.local.get('taptap:pages').then(v => {
  const page = v['taptap:pages'] || {};
  const first = Object.values(page)[0];
  return first ? first.annotations.map(a => ({ prompt: a.prompt, selector: a.meta.selector, kind: a.anchor.candidates[0].kind })) : [];
})`);
check('annotations are persisted', stored.length === 2, JSON.stringify(stored));
check('id is the first anchor when there is one', stored[0]?.kind === 'id' && stored[0].selector === '#q', stored[0]?.selector);
check('test id is the first anchor without an id', stored[1]?.kind === 'testid', stored[1]?.selector);
await shot('02-hud');

// 7. the annotations survive a reload and re-attach to their elements
await cdp.send('Page.reload', {}, page);
await sleep(1500);
const afterReload = await waitFor(async () => {
  const count = await find('count');
  return count ? prop(count, 'function(){ return this.textContent }') : null;
}, 6000);
check('mode survives reload', (await find('frame')) !== null);
check('annotations survive reload', afterReload === '2', afterReload || 'no count');
check('markers re-anchor after reload', (await findAll('marker')).length === 2);

// 8. submit builds one prompt from the page and the annotations
const submit = await find('btn-submit');
check('hud has a submit button', !!submit);
await clickNode(submit);
const modal = await waitFor(() => find('modal'));
check('submit opens the prompt panel', !!modal);
const promptText = modal ? await prop(await find('modal-box'), 'function(){ return this.querySelector("textarea").value }') : '';
check('prompt has the page url', promptText.includes(pageUrl), '');
check('prompt has the id selector', promptText.includes('`#q`'));
check('prompt keeps the test id in the attributes', promptText.includes('home-search-input'));
check('prompt has both requests', promptText.includes('Make the placeholder shorter') && promptText.includes('Find stays'));
check('prompt names the page', promptText.includes('Checkout — Taptap fixture'));
check('prompt says how many annotations', promptText.includes('- annotations: 2'));
await shot('03-prompt');

// 9. component names come from the page world: a React fiber on a page that has
//    no live React, so this exercises the probe bridge and nothing else
await cdp.send('Page.navigate', { url: `${origin}/react` }, page);
await sleep(1600);
check('mode follows a navigation', (await waitFor(() => find('frame'), 5000)) !== null);
const price = await center('[data-testid="price-card"]');
await move(price.x, price.y);
await click(price.x, price.y);
const reactCard = await waitFor(() => find('card'));
const reactCardHtml = reactCard ? await html(reactCard) : '';
check('card reads the React component name', reactCardHtml.includes('PriceCard ← HotelPage'), '');
await cdp.send('Input.insertText', { text: 'Round the price up and keep the currency symbol.' }, page);
await clickNode(await find('btn-primary'));
await sleep(300);
await clickNode(await find('btn-submit'));
const reactPrompt = await waitFor(async () => {
  const box = await find('modal-box');
  return box ? prop(box, 'function(){ return this.querySelector("textarea").value }') : null;
});
check('prompt carries the component chain', !!reactPrompt && reactPrompt.includes('PriceCard') && reactPrompt.includes('HotelPage'));
check('prompt carries the framework', !!reactPrompt && reactPrompt.includes('React'));
check('prompt carries the devtools version', !!reactPrompt && reactPrompt.includes('19.1.0'));
await shot('04-react');

// 10. esc leaves annotation mode and restores the page
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
await sleep(400);
check('esc closes the prompt', (await find('modal')) === null);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
await sleep(400);
check('esc exits annotation mode', (await find('frame')) === null);
check('cursor is restored', (await evalPage(`document.documentElement.classList.contains('__taptap_cursor')`)) === false);

// 11. the real toolbar path: Extensions.triggerAction presses the button, so this
//     goes through the service worker's toggle, badge and all — not a message we
//     send by hand the way the checks above do.
await cdp.send('Target.setDiscoverTargets', { discover: true, filter: [{ type: 'tab' }, { type: 'page' }] });
await sleep(300);
const tabTarget = (await cdp.send('Target.getTargets')).targetInfos.find((t) => t.type === 'tab');
check('the browser exposes a tab target', !!tabTarget);

if (tabTarget) {
  const press = () => cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tabTarget.targetId });
  const pressToggled = await Promise.race([press().then(() => true), sleep(6000).then(() => false)]);
  check('the toolbar button runs the worker', pressToggled);
  check('the toolbar button turns the mode on', (await waitFor(() => find('frame'), 5000)) !== null);
  await press();
  check('the toolbar button turns the mode off', (await waitFor(async () => (await find('frame')) === null, 4000)) === true);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed · extension ${extensionId} · shots in .tmp/smoke`);
cdp.close();
process.exit(failed.length ? 1 : 0);
