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

async function toggle(tab) {
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    await flashUnavailable(tab?.id);
    return;
  }
  const map = await readActive();
  const on = !map[tab.id];
  if (on && !(await tell(tab.id, true))) {
    await flashUnavailable(tab.id);
    return;
  }
  await setActive(tab.id, on);
  if (!on) await tell(tab.id, false);
}

/** A short "!" badge when the page cannot run the annotation script. */
async function flashUnavailable(tabId) {
  if (!tabId) return;
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#F87171' });
  await chrome.action.setBadgeTextColor?.({ tabId, color: '#0D0D0D' });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }, 2500);
}

chrome.action.onClicked.addListener((tab) => {
  toggle(tab);
});

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
