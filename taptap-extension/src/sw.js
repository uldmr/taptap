// Service worker: owns the per-tab "annotation mode is on" flag and the toolbar action.
// The page script is dormant; it only asks here whether its tab is in the set.

import { installProbe } from './content/stack.js';

const ACTIVE_KEY = 'taptap:active-tabs'; // chrome.storage.session: { [tabId]: true }
const BRAND = '#38BDF8';

async function readActive() {
  const got = await chrome.storage.session.get(ACTIVE_KEY);
  return got[ACTIVE_KEY] || {};
}

async function writeActive(map) {
  await chrome.storage.session.set({ [ACTIVE_KEY]: map });
}

async function paint(tabId, on) {
  await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BRAND });
  await chrome.action.setBadgeTextColor?.({ tabId, color: '#0D0D0D' });
  await chrome.action.setTitle({
    tabId,
    title: on ? 'Stop annotating (Alt+A)' : 'Annotate this page (Alt+A)',
  });
}

async function setActive(tabId, on) {
  const map = await readActive();
  if (on) map[tabId] = true;
  else delete map[tabId];
  await writeActive(map);
  await paint(tabId, on);
}

/** Tell the page to switch modes. False when no page script answers (chrome://, store, PDF). */
async function tell(tabId, on) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'taptap:set-active', active: on });
    return true;
  } catch {
    return false;
  }
}

/**
 * Put the page script into a tab that has none: a page opened before the
 * extension was installed or reloaded never runs the declared content script,
 * and Chrome does not go back and inject it. Injecting on the first tap is what
 * makes the toolbar button work on that tab instead of asking for a reload.
 */
async function revive(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (err) {
    console.warn('[taptap] cannot inject the page script:', err?.message || err);
    return false;
  }
}

/** True when the page script is present and was told to switch modes. */
async function reach(tabId, on) {
  if (await tell(tabId, on)) return true;
  if (!(await revive(tabId))) return false;
  // The script is there now; the second call is the one that counts.
  return tell(tabId, on);
}

async function toggle(tab) {
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    await flashUnavailable(tab?.id, 'Only http and https pages can be annotated');
    return;
  }
  const map = await readActive();
  const on = !map[tab.id];
  if (on && !(await reach(tab.id, true))) {
    await flashUnavailable(tab.id, 'This page blocks scripts — taptap cannot run here');
    return;
  }
  await setActive(tab.id, on);
  if (!on) await tell(tab.id, false);
}

/** A short "!" badge when the page cannot run the annotation script. */
async function flashUnavailable(tabId, reason = 'Taptap cannot run on this page') {
  if (!tabId) return;
  console.warn('[taptap]', reason, 'tab', tabId);
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#F87171' });
  await chrome.action.setBadgeTextColor?.({ tabId, color: '#0D0D0D' });
  await chrome.action.setTitle({ tabId, title: reason });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    chrome.action
      .setTitle({ tabId, title: 'Annotate this page (Alt+A)' })
      .catch(() => {});
  }, 2500);
}

chrome.action.onClicked.addListener((tab) => {
  toggle(tab);
});

// The toolbar handler is also reachable from the service worker's console and
// from the end-to-end test, which cannot press a toolbar button.
globalThis.__taptapToggle = toggle;

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-annotations') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) toggle(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender?.tab?.id;
  if (!tabId) return;

  if (msg?.type === 'taptap:hello') {
    readActive().then((map) => reply({ active: !!map[tabId] }));
    return true;
  }
  if (msg?.type === 'taptap:probe-ready') {
    // Component names live on page-world wrappers; only a MAIN-world script can read them.
    injectProbe(tabId).then((ok) => reply({ ok }));
    return true;
  }
  if (msg?.type === 'taptap:deactivate') {
    setActive(tabId, false).then(() => reply({ ok: true }));
    return true;
  }
  if (msg?.type === 'taptap:activate') {
    setActive(tabId, true).then(() => reply({ ok: true }));
    return true;
  }
});

async function injectProbe(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: installProbe });
    return true;
  } catch {
    return false;
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await readActive();
  if (!(tabId in map)) return;
  delete map[tabId];
  await writeActive(map);
});

// A reload keeps the tab id, so mode survives it; only a new session clears the set.
chrome.runtime.onStartup?.addListener(() => writeActive({}));
