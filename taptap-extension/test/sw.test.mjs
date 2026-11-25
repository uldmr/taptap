// The service worker's decision: which tab gets the toolbar click, when the page
// script has to be injected, and what the badge says when neither works.
//
// The worker talks to chrome.* and nothing else, so the test supplies a stand-in
// and drives `toggle` exactly as the toolbar button does.

import assert from 'node:assert/strict';
import test from 'node:test';

// --- a chrome stand-in ------------------------------------------------------

function fakeChrome({ sendMessage, executeScript, active = {} }) {
  const calls = { badge: [], title: [], executeScript: [], sendMessage: [] };
  const session = { 'taptap:active-tabs': { ...active } };
  const listeners = { onMessage: [], onRemoved: [], onCommand: [], onStartup: [] };

  return {
    calls,
    api: {
      storage: {
        session: {
          get: async (key) => ({ [key]: session[key] }),
          set: async (obj) => Object.assign(session, obj),
        },
      },
      action: {
        setBadgeText: async ({ tabId, text }) => calls.badge.push({ tabId, text }),
        setBadgeBackgroundColor: async () => {},
        setBadgeTextColor: async () => {},
        setTitle: async ({ tabId, title }) => calls.title.push({ tabId, title }),
        onClicked: { addListener: () => {} },
      },
      tabs: {
        sendMessage: async (tabId, msg) => {
          calls.sendMessage.push({ tabId, msg });
          if (sendMessage.willFail(calls.sendMessage.length)) throw new Error('Receiving end does not exist.');
          return { ok: true };
        },
        query: async () => [],
        onRemoved: { addListener: (fn) => listeners.onRemoved.push(fn) },
      },
      commands: { onCommand: { addListener: (fn) => listeners.onCommand.push(fn) } },
      runtime: {
        onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
        onStartup: { addListener: (fn) => listeners.onStartup.push(fn) },
      },
      scripting: {
        executeScript: async (opts) => {
          calls.executeScript.push(opts);
          if (executeScript.fails) throw new Error('Cannot access contents of the page.');
          return [{ frameId: 0 }];
        },
      },
    },
    session,
  };
}

/**
 * Load the worker against a fresh stand-in. `sw.js` installs listeners at the top
 * level, so it gets a new module instance per fake (`?v=` busts the module cache).
 */
let version = 0;
async function loadWorker(fake) {
  globalThis.chrome = fake.api;
  const mod = await import(`../src/sw.js?v=${++version}`);
  assert.equal(typeof globalThis.__taptapToggle, 'function', 'sw.js did not expose the toolbar handler');
  return { toggle: globalThis.__taptapToggle, module: mod };
}

const HTTP_TAB = { id: 7, url: 'https://example.com/checkout' };
const lastBadge = (calls) => calls.badge.at(-1)?.text ?? '';

// --- cases -----------------------------------------------------------------

test('a page that answers is activated without injecting anything', async () => {
  const fake = fakeChrome({ sendMessage: { willFail: () => false }, executeScript: {} });
  const { toggle } = await loadWorker(fake);

  await toggle(HTTP_TAB);

  assert.equal(fake.calls.executeScript.length, 0, 'should not inject into a page that has the script');
  assert.equal(fake.calls.sendMessage.length, 1);
  assert.equal(fake.calls.sendMessage[0].msg.active, true);
  assert.equal(lastBadge(fake.calls), 'ON');
  assert.deepEqual(fake.session['taptap:active-tabs'], { 7: true });
});

test('an already-open tab gets the page script injected, then is activated', async () => {
  // The first message finds nobody — the tab was loaded before the extension.
  const fake = fakeChrome({ sendMessage: { willFail: (n) => n === 1 }, executeScript: {} });
  const { toggle } = await loadWorker(fake);

  await toggle(HTTP_TAB);

  assert.equal(fake.calls.executeScript.length, 1, 'the page script should be injected once');
  assert.deepEqual(fake.calls.executeScript[0].files, ['content.js']);
  assert.equal(fake.calls.executeScript[0].target.tabId, 7);
  assert.equal(fake.calls.sendMessage.length, 2, 'the second message is the one that counts');
  assert.equal(lastBadge(fake.calls), 'ON');
  assert.deepEqual(fake.session['taptap:active-tabs'], { 7: true });
});

test('a page that refuses injection shows the warning and stays off', async () => {
  const fake = fakeChrome({
    sendMessage: { willFail: () => true },
    executeScript: { fails: true },
  });
  const { toggle } = await loadWorker(fake);

  await toggle(HTTP_TAB);

  assert.equal(lastBadge(fake.calls), '!');
  assert.match(fake.calls.title.at(-1).title, /blocks scripts/i);
  assert.deepEqual(fake.session['taptap:active-tabs'], {}, 'a failed activation must not mark the tab active');
});

test('a page that is not http(s) is refused without touching it', async () => {
  const fake = fakeChrome({ sendMessage: { willFail: () => false }, executeScript: {} });
  const { toggle } = await loadWorker(fake);

  await toggle({ id: 9, url: 'chrome://extensions' });

  assert.equal(fake.calls.executeScript.length, 0);
  assert.equal(fake.calls.sendMessage.length, 0);
  assert.equal(lastBadge(fake.calls), '!');
  assert.match(fake.calls.title.at(-1).title, /http and https/i);
});

test('switching off clears the flag and asks the page to stop', async () => {
  const fake = fakeChrome({ sendMessage: { willFail: (n) => n === 1 }, executeScript: {} });
  const { toggle } = await loadWorker(fake);

  await toggle(HTTP_TAB);
  fake.calls.sendMessage.length = 0;
  await toggle(HTTP_TAB);

  assert.deepEqual(fake.session['taptap:active-tabs'], {});
  assert.equal(fake.calls.sendMessage.length, 1);
  assert.equal(fake.calls.sendMessage[0].msg.active, false);
  assert.equal(lastBadge(fake.calls), '');
});
