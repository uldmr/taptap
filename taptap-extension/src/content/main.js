// The engine: dormant until the tab is switched into annotation mode, then it
// owns hover, selection, cards, the HUD and the prompt.

import { candidates, describe, fingerprint, localClass } from './anchor.js';
import { accName } from './dom.js';
import { UI } from './overlay.js';
import { buildPrompt } from './prompt.js';
import { detectPage, probe } from './stack.js';
import { loadAnnotations, loadHudPos, pageKey, saveAnnotations, saveHudPos } from './store.js';

if (!globalThis.__taptapEngine) {
  globalThis.__taptapEngine = true;
  start();
}

function start() {
  const CURSOR_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<path d="M4.5 2.5 4.5 20.2 9.3 15.4 12.2 22.4 15.6 21 12.7 14.1 19.1 14.1Z" ' +
    'fill="#38BDF8" stroke="#0D0D0D" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const CURSOR = `url("data:image/svg+xml,${encodeURIComponent(CURSOR_SVG)}") 4 3, crosshair`;
  const CURSOR_ID = 'taptap-cursor-style';
  const CURSOR_CLASS = '__taptap_cursor';

  const ui = new UI({ onHudMove: (pos) => pos && saveHudPos(pos) });

  let active = false;
  let annotations = [];
  let markerItems = [];
  let current = null; // {el, meta, annotation}
  let pointer = null;
  let pointerDirty = false;
  let hudCollapsed = false;
  let confirmReset = false;
  let confirmTimer = 0;
  let lastHref = location.href;
  let raf = 0;
  let probeReady = false;
  let saveTimer = 0;
  let currentKey = pageKey(location.href);
  let hudPending = null;
  let lastProbeChain = [];

  const labelCache = new WeakMap();

  // --- cursor --------------------------------------------------------------

  function setCursor(on) {
    if (on) {
      if (!document.getElementById(CURSOR_ID)) {
        const style = document.createElement('style');
        style.id = CURSOR_ID;
        style.textContent = `html.${CURSOR_CLASS}, html.${CURSOR_CLASS} * { cursor: ${CURSOR} !important; }`;
        (document.head || document.documentElement).append(style);
      }
      document.documentElement.classList.add(CURSOR_CLASS);
    } else {
      document.documentElement.classList.remove(CURSOR_CLASS);
      document.getElementById(CURSOR_ID)?.remove();
    }
  }

  // --- activation ----------------------------------------------------------

  async function activate() {
    if (active) return;
    active = true;
    ui.attach();
    setCursor(true);
    bind(true);
    startLoop();
    await loadPage();
    ui.toast('Annotation mode · tap an element · Esc to exit');
    askForProbe();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    bind(false);
    stopLoop();
    ui.closeCard();
    ui.hidePrompt();
    ui.clearHover();
    setCursor(false);
    ui.detach();
    current = null;
    markerItems = [];
    chrome.runtime.sendMessage({ type: 'taptap:deactivate' }).catch(() => {});
  }

  /** Ask the service worker to plant the page-world probe (component names). */
  function askForProbe() {
    chrome.runtime
      .sendMessage({ type: 'taptap:probe-ready' })
      .then((res) => {
        probeReady = !!res?.ok;
      })
      .catch(() => {
        probeReady = false;
      });
  }

  // --- listeners -----------------------------------------------------------

  const onPointerMove = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    pointerDirty = true;
  };
  const onScroll = () => {
    pointerDirty = true;
  };
  const onClick = (e) => {
    if (e.composedPath().includes(ui.host)) return; // our own panel
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const target = document.elementFromPoint(x, y);
    if (!target || target === document.documentElement) return;
    pick(target, x, y);
  };
  const swallow = (e) => {
    if (e.composedPath().includes(ui.host)) return;
    e.stopPropagation();
    if (e.type !== 'mouseup') e.preventDefault();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (ui.hasPrompt()) {
      e.preventDefault();
      ui.hidePrompt();
      return;
    }
    if (ui.hasCard()) {
      if (e.target === ui.host) return; // the card handles its own Escape
      e.preventDefault();
      closeCard();
      return;
    }
    e.preventDefault();
    deactivate();
  };

  function bind(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    document[method]('pointermove', onPointerMove, true);
    document[method]('pointerdown', swallow, true);
    document[method]('click', onClick, true);
    document[method]('mousedown', swallow, true);
    document[method]('mouseup', swallow, true);
    document[method]('dblclick', swallow, true);
    document[method]('auxclick', swallow, true);
    window[method]('scroll', onScroll, { capture: true, passive: true });
    window[method]('keydown', onKey, true);
  }

  // --- hover ---------------------------------------------------------------

  function labelFor(el) {
    const cached = labelCache.get(el);
    if (cached) return cached;
    const name = accName(el);
    const id = el.id ? '#' + el.id : '';
    const first = el.classList?.length ? localClass(el.classList[0]) : null;
    const cls = first && !id ? '.' + first : '';
    const label = `${el.localName}${id}${cls}${name && !id ? ` “${name}”` : ''}`;
    labelCache.set(el, label);
    return label;
  }

  function hoverAt() {
    if (!pointer) return;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    if (!target || target === document.documentElement || target === document.body) {
      ui.clearHover();
      return;
    }
    ui.setHover(target.getBoundingClientRect(), labelFor(target));
  }

  // --- selection -----------------------------------------------------------

  async function pick(el, x, y) {
    let info = null;
    if (probeReady) info = await probe(x, y).catch(() => null);
    const meta = describe(el, info || {});
    if (meta.componentChain.length) lastProbeChain = meta.componentChain;
    current = { el, meta, annotation: null };
    openCard();
  }

  function openCard() {
    if (!current) return;
    const { el, meta, annotation } = current;
    ui.openCard({
      rect: el.getBoundingClientRect(),
      meta,
      annotation,
      onSave: (text) => {
        if (annotation) {
          annotation.prompt = text;
          annotation.updatedAt = Date.now();
        } else {
          annotations.push({
            id: crypto.randomUUID ? crypto.randomUUID() : `a${Date.now()}`,
            prompt: text,
            meta,
            el,
            anchor: { candidates: candidates(el), fingerprint: fingerprint(el) },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        current = null;
        ui.closeCard();
        persist();
        render();
      },
      onDelete: () => {
        if (annotation) {
          annotations = annotations.filter((a) => a.id !== annotation.id);
          persist();
          render();
        }
        current = null;
        ui.closeCard();
      },
      onClose: closeCard,
    });
  }

  function closeCard() {
    ui.closeCard();
    current = null;
  }

  function edit(id) {
    const item = annotations.find((a) => a.id === id);
    if (!item) return;
    if (!item.el || !item.el.isConnected) {
      ui.toast('That element is gone from the page — tap it again');
      return;
    }
    item.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    current = { el: item.el, meta: item.meta, annotation: item };
    openCard();
  }

  // --- page + storage ------------------------------------------------------

  async function loadPage() {
    annotations = [];
    markerItems = [];
    try {
      const saved = await loadAnnotations(location.href);
      annotations = saved.map((rec) => ({ ...rec, el: resolveAnchor(rec.anchor) }));
    } catch {
      annotations = [];
    }
    render();
  }

  // Kept local so a broken anchor never takes the whole engine down.
  function resolveAnchor(anchor) {
    if (!anchor?.candidates?.length) return null;
    const fp = anchor.fingerprint;
    for (const c of anchor.candidates) {
      let found;
      try {
        found = [...document.querySelectorAll(c.selector)];
      } catch {
        continue;
      }
      if (!found.length) continue;
      let pick = null;
      if (found.length === 1) pick = found[0];
      else if (c.index >= 0 && c.index < found.length) pick = found[c.index];
      if (!pick) continue;
      if (fp?.tag && pick.localName !== fp.tag) continue;
      return pick;
    }
    return null;
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveAnnotations(currentKey, annotations).catch(() => {});
    }, 200);
  }

  // --- rendering -----------------------------------------------------------

  function render() {
    const items = annotations.map((a, i) => ({ ...a, index: i + 1 }));
    markerItems = items.map((a) => ({
      el: a.el,
      index: a.index,
      title: a.prompt || '',
      rect: a.el && a.el.isConnected ? a.el.getBoundingClientRect() : null,
      onOpen: () => edit(a.id),
    }));

    ui.renderMarkers(markerItems.filter((m) => m.el && m.el.isConnected));
    ui.renderHud(
      {
        annotations: items.map((a) => ({
          index: a.index,
          selector: a.meta?.selector || a.meta?.tag || '',
          prompt: a.prompt || '',
          tag: a.meta?.tag,
        })),
        collapsed: hudCollapsed,
        confirmReset,
      },
      {
        onOpen: (index) => {
          const item = annotations[index - 1];
          if (item) edit(item.id);
        },
        onDelete: (index) => {
          const item = annotations[index - 1];
          if (!item) return;
          annotations = annotations.filter((a) => a.id !== item.id);
          persist();
          render();
        },
        onReset: () => {
          if (!confirmReset) {
            confirmReset = true;
            render();
            clearTimeout(confirmTimer);
            confirmTimer = setTimeout(() => {
              confirmReset = false;
              render();
            }, 3000);
            return;
          }
          confirmReset = false;
          annotations = [];
          persist();
          render();
          ui.toast('Annotations on this page cleared');
        },
        onToggle: () => {
          hudCollapsed = !hudCollapsed;
          render();
        },
        onSubmit: submit,
      },
    );
  }

  // --- prompt --------------------------------------------------------------

  function pageMeta() {
    return {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: Math.round(devicePixelRatio || 1) },
      stack: detectPage(),
      probe: lastProbeChain.length ? { chain: lastProbeChain, component: lastProbeChain[0] } : null,
    };
  }

  function submit() {
    const items = annotations.filter((a) => a.prompt?.trim());
    if (!items.length) {
      ui.toast('Write something on at least one element');
      return;
    }
    const text = buildPrompt({ page: pageMeta(), annotations: items });
    ui.showPrompt({
      text,
      count: items.length,
      onCopy: async (value) => {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch {
          return false;
        }
      },
      onClose: () => ui.hidePrompt(),
    });
  }

  // --- loop ----------------------------------------------------------------

  function startLoop() {
    if (raf) return;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (location.href !== lastHref) {
        lastHref = location.href;
        const key = pageKey(location.href);
        if (key !== currentKey) {
          currentKey = key;
          closeCard();
          loadPage();
        }
      }
      if (!ui.hasCard() && !ui.hasPrompt() && pointerDirty) {
        pointerDirty = false;
        hoverAt();
      }
      if (ui.hasCard() && current?.el?.isConnected) {
        ui.repositionCard(current.el.getBoundingClientRect());
      }
      if (markerItems.length) {
        const rects = markerItems.map((m) => (m.el?.isConnected ? m.el.getBoundingClientRect() : null));
        markerItems.forEach((m, i) => {
          m.rect = rects[i];
          if (m.node) ui.positionMarker(m);
        });
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
    pointer = null;
    pointerDirty = false;
  }

  // --- boot ----------------------------------------------------------------

  // A visible trace in the page's own DevTools: proof that the engine is in the
  // tab, which is the first thing to check when the toolbar button does nothing.
  document.documentElement.setAttribute('data-taptap-engine', '1');

  loadHudPos()
    .then((pos) => {
      if (pos) hudPending = pos;
    })
    .catch(() => {});

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'taptap:set-active') return;
    if (msg.active) {
      activate().then(() => {
        if (hudPending) {
          ui.setHudPos(hudPending);
          hudPending = null;
        }
      });
    } else {
      deactivate();
    }
  });

  chrome.runtime
    .sendMessage({ type: 'taptap:hello' })
    .then((res) => {
      if (res?.active) activate();
    })
    .catch(() => {});
}
