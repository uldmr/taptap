// Persistence. One record per page (origin + path, query and hash ignored so a
// filter change is still the same page), all of them in chrome.storage.local:
// no network, no sync, nothing leaves the machine.

const PAGES = 'taptap:pages';
const HUD = 'taptap:hud';
const MAX_PAGES = 300;

/** Identity of a page: `https://example.com/checkout` (query and hash dropped). */
export function pageKey(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return u.origin + path;
  } catch {
    return String(url);
  }
}

async function readAll() {
  const got = await chrome.storage.local.get(PAGES);
  return got[PAGES] || {};
}

export async function loadAnnotations(url) {
  const key = pageKey(url);
  const all = await readAll();
  return all[key]?.annotations || [];
}

export async function saveAnnotations(url, annotations) {
  const all = await readAll();
  const key = pageKey(url);
  if (!annotations.length) delete all[key];
  else all[key] = { url, updatedAt: Date.now(), annotations };

  const keys = Object.keys(all);
  if (keys.length > MAX_PAGES) {
    keys
      .sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
      .slice(0, keys.length - MAX_PAGES)
      .forEach((k) => delete all[k]);
  }
  await chrome.storage.local.set({ [PAGES]: all });
}

export async function clearPage(url) {
  const all = await readAll();
  delete all[pageKey(url)];
  await chrome.storage.local.set({ [PAGES]: all });
}

export async function loadHudPos() {
  const got = await chrome.storage.local.get(HUD);
  return got[HUD] || null;
}

export async function saveHudPos(pos) {
  await chrome.storage.local.set({ [HUD]: pos });
}
