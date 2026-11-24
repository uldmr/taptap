// Everything the user sees, inside one closed shadow root so a page's CSS cannot
// reach it and ours cannot leak out. Pointer events are off on the whole layer and
// switched on per panel, so the page below stays fully usable.

const CSS = `
:host { all: initial; --tt-brand: #38BDF8; --tt-brand-dim: rgba(56,189,248,.34); --tt-bg: #0D0D0D;
  --tt-fg: #E7E9EA; --tt-mut: #8B949E; --tt-line: #232A31; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.tt { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; direction: ltr; text-align: left;
  font: 13px/1.45 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--tt-fg); -webkit-font-smoothing: antialiased; }
.mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }

/* viewport frame */
.frame { position: absolute; inset: 0; pointer-events: none; }
.frame::before { content: ""; position: absolute; inset: 0; border: 2px solid var(--tt-brand);
  box-shadow: inset 0 0 0 1px rgba(13,13,13,.55), inset 0 0 60px rgba(56,189,248,.10); }
.frame-tag { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); display: flex; align-items: center;
  gap: 8px; height: 26px; padding: 0 10px 0 9px; border-radius: 999px; background: var(--tt-bg);
  border: 1px solid var(--tt-brand-dim); box-shadow: 0 6px 18px rgba(0,0,0,.45); font-size: 11px; line-height: 1;
  letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; }
.frame-tag .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tt-brand);
  box-shadow: 0 0 0 3px rgba(56,189,248,.18); animation: tt-pulse 2s ease-in-out infinite; }
.frame-tag kbd { font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 3px 5px; border-radius: 4px;
  background: #1b2026; color: var(--tt-mut); text-transform: none; }
@keyframes tt-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }

/* hover */
.hover { position: absolute; pointer-events: none; border: 1.5px solid var(--tt-brand); border-radius: 3px;
  background: rgba(56,189,248,.10); box-shadow: 0 0 0 1px rgba(13,13,13,.55); }
.hover-label { position: absolute; left: -1px; bottom: 100%; margin-bottom: 3px; max-width: 340px; padding: 2px 6px;
  border-radius: 4px; background: var(--tt-brand); color: #06222e; font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hover.below .hover-label { bottom: auto; top: 100%; margin: 3px 0 0; }

/* annotation card */
.card { position: absolute; width: 340px; max-width: calc(100vw - 16px); pointer-events: auto; background: var(--tt-bg);
  border: 1px solid var(--tt-brand-dim); border-radius: 12px; box-shadow: 0 20px 44px rgba(0,0,0,.55); overflow: hidden; }
.card-head { display: flex; align-items: center; gap: 8px; padding: 10px 8px 8px 12px; border-bottom: 1px solid var(--tt-line); }
.chip { font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--tt-brand); background: rgba(56,189,248,.12);
  border: 1px solid rgba(56,189,248,.30); padding: 4px 6px; border-radius: 5px; max-width: 150px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.card-sub { flex: 1; min-width: 0; font-size: 11px; color: var(--tt-mut); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attrs { display: grid; gap: 2px; padding: 8px 12px 4px; max-height: 130px; overflow: auto; }
.attr { display: flex; gap: 8px; font-size: 11.5px; line-height: 1.5; }
.attr .k { width: 64px; flex: none; color: var(--tt-mut); }
.attr .v { min-width: 0; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #CFD6DD;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attr .v.more { color: var(--tt-brand); cursor: pointer; }
.prompt { display: block; width: calc(100% - 24px); margin: 6px 12px 10px; min-height: 64px; max-height: 190px;
  resize: vertical; padding: 8px 10px; border-radius: 8px; border: 1px solid #2A3138; background: #131A20;
  color: var(--tt-fg); font: 13px/1.45 inherit; }
.prompt::placeholder { color: #6B7480; }
.prompt:focus { outline: none; border-color: var(--tt-brand); box-shadow: 0 0 0 3px rgba(56,189,248,.16); }
.card-foot { display: flex; align-items: center; gap: 8px; padding: 0 12px 12px; }
.hint { flex: 1; font-size: 10.5px; color: #6B7480; }
.btn { appearance: none; border: 1px solid #2A3138; background: #171E24; color: var(--tt-fg); padding: 6px 12px;
  border-radius: 7px; font: 600 12px/1.2 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; cursor: pointer; }
.btn:hover { border-color: #3A444D; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-primary { background: var(--tt-brand); border-color: var(--tt-brand); color: #04222E; }
.btn-submit { background: linear-gradient(180deg, #00FF41, #00CC33); border-color: #00CC33; color: #00280C; }
.btn-ghost { background: transparent; }
.btn-danger { background: transparent; border-color: rgba(248,113,113,.35); color: #F87171; }
.btn-icon { appearance: none; border: 0; background: transparent; color: var(--tt-mut); width: 24px; height: 24px;
  border-radius: 6px; cursor: pointer; font: 16px/1 ui-sans-serif, sans-serif; padding: 0; }
.btn-icon:hover { background: #1B2026; color: var(--tt-fg); }

/* markers */
.marker { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50% 50% 50% 4px;
  background: var(--tt-brand); color: #04222E; font: 700 10px/20px ui-monospace, monospace; text-align: center;
  pointer-events: auto; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.45); }
.marker:hover { background: #7DD3FC; }

/* hud */
.hud { position: absolute; width: 296px; max-width: calc(100vw - 16px); pointer-events: auto; background: var(--tt-bg);
  border: 1px solid var(--tt-brand-dim); border-radius: 14px; box-shadow: 0 20px 44px rgba(0,0,0,.55); overflow: hidden; }
.hud-head { display: flex; align-items: center; gap: 8px; padding: 9px 8px 9px 12px; cursor: grab; user-select: none;
  border-bottom: 1px solid var(--tt-line); touch-action: none; }
.hud-head:active { cursor: grabbing; }
.brand { display: flex; align-items: center; gap: 6px; font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .12em; text-transform: uppercase; }
.brand i { width: 8px; height: 8px; border-radius: 2px; background: var(--tt-brand); display: inline-block;
  box-shadow: 0 0 8px rgba(56,189,248,.65); }
.count { margin-left: auto; font: 600 11px/1 ui-monospace, monospace; color: var(--tt-brand);
  background: rgba(56,189,248,.12); padding: 4px 7px; border-radius: 999px; }
.hud-list { max-height: 42vh; overflow: auto; padding: 4px; }
.item { display: flex; gap: 8px; padding: 7px 8px; border-radius: 8px; cursor: pointer; align-items: flex-start; }
.item:hover { background: #151C22; }
.item .n { flex: none; width: 18px; height: 18px; border-radius: 50%; background: rgba(56,189,248,.14);
  color: var(--tt-brand); font: 700 10px/18px ui-monospace, monospace; text-align: center; }
.item .body { min-width: 0; flex: 1; }
.item .sel { font: 10.5px/1.4 ui-monospace, monospace; color: var(--tt-mut); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.item .txt { font-size: 12px; color: #DDE3E8; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; }
.item .del { opacity: 0; transition: opacity .12s; }
.item:hover .del { opacity: 1; }
.hud-foot { display: flex; gap: 8px; padding: 8px; border-top: 1px solid var(--tt-line); }
.hud-empty { padding: 14px 12px; color: var(--tt-mut); font-size: 12px; }
.hud.collapsed .hud-list, .hud.collapsed .hud-foot { display: none; }

/* prompt modal */
.modal { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(4,7,9,.55);
  backdrop-filter: blur(3px); pointer-events: auto; }
.modal-box { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column;
  background: var(--tt-bg); border: 1px solid var(--tt-brand-dim); border-radius: 14px;
  box-shadow: 0 30px 70px rgba(0,0,0,.6); overflow: hidden; }
.modal-head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-bottom: 1px solid var(--tt-line); }
.modal-title { font: 700 11px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
.modal-sub { flex: 1; font-size: 11px; color: var(--tt-mut); }
.modal textarea { flex: 1; min-height: 240px; margin: 12px; padding: 12px; border-radius: 10px; border: 1px solid #2A3138;
  background: #10161B; color: #DDE3E8; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; resize: none; }
.modal textarea:focus { outline: none; border-color: var(--tt-brand); }
.modal-foot { display: flex; align-items: center; gap: 8px; padding: 0 12px 12px; }
.modal-foot .hint { flex: 1; }

/* toast */
.toast { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--tt-bg);
  border: 1px solid var(--tt-brand-dim); color: var(--tt-fg); padding: 8px 14px; border-radius: 999px; font-size: 12px;
  box-shadow: 0 12px 30px rgba(0,0,0,.5); }
`;

const MARGIN = 8;
const GAP = 12;
const SIDES = ['top', 'bottom', 'right', 'left'];
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

/**
 * Where a floating panel goes next to a rect: preferred side when it fits, else
 * the roomiest side. Pure, so the placement rules are unit-tested.
 */
export function place(rect, w, h, vw, vh, prefer = 'top') {
  const space = {
    top: rect.top,
    bottom: vh - rect.bottom,
    left: rect.left,
    right: vw - rect.right,
  };
  const fits = (side) =>
    side === 'top' || side === 'bottom' ? space[side] >= h + GAP : space[side] >= w + GAP;

  const side = [prefer, ...SIDES.filter((s) => s !== prefer)].find(fits) ||
    SIDES.slice().sort((a, b) => space[b] - space[a])[0];

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let left = cx - w / 2;
  let top = cy - h / 2;
  if (side === 'top') top = rect.top - h - GAP;
  if (side === 'bottom') top = rect.bottom + GAP;
  if (side === 'left') left = rect.left - w - GAP;
  if (side === 'right') left = rect.right + GAP;

  left = clamp(left, MARGIN, vw - w - MARGIN);
  top = clamp(top, MARGIN, vh - h - MARGIN);

  const arrow =
    side === 'top' || side === 'bottom'
      ? { axis: 'x', at: clamp(cx - left, 14, w - 14) }
      : { axis: 'y', at: clamp(cy - top, 14, h - 14) };

  return { left, top, side, arrow };
}

const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height });

export class UI {
  constructor({ onHudMove } = {}) {
    this.onHudMove = onHudMove || (() => {});
    this.host = el('div');
    this.host.setAttribute('data-taptap-root', '');
    this.host.style.pointerEvents = 'none';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = el('style');
    style.textContent = CSS;

    this.root = el('div', 'tt');

    this.frame = el('div', 'frame');
    const tag = el('div', 'frame-tag');
    tag.append(el('span', 'dot'));
    tag.append(el('span', '', 'Annotation mode'));
    const kbd = el('kbd', '', 'Esc');
    tag.append(kbd);
    this.frame.append(tag);

    this.hover = el('div', 'hover');
    this.hoverLabel = el('div', 'hover-label');
    this.hover.append(this.hoverLabel);

    this.markers = el('div', 'markers');
    this.cards = el('div', 'cards');
    this.root.append(this.frame, this.hover, this.markers, this.cards);
    this.shadow.append(style, this.root);

    this.cardState = null;
    this.hudEl = null;
    this.modalEl = null;
    this.toastEl = null;
    this.hoverRect = null;
  }

  attach() {
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.frame.hidden = false;
  }

  detach() {
    this.host.remove();
    this.cardState = null;
    this.hudEl = null;
    this.modalEl = null;
    this.hover.hidden = true;
  }

  // --- hover ---------------------------------------------------------------

  setHover(rect, label) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return this.clearHover();
    const r = rectOf(rect);
    this.hover.hidden = false;
    this.hover.style.left = `${r.left}px`;
    this.hover.style.top = `${r.top}px`;
    this.hover.style.width = `${r.width}px`;
    this.hover.style.height = `${r.height}px`;
    this.hover.classList.toggle('below', r.top < 26);
    if (this.hoverLabel.textContent !== label) this.hoverLabel.textContent = label;
  }

  clearHover() {
    this.hover.hidden = true;
  }

  // --- card ----------------------------------------------------------------

  /**
   * @param {object} opts {rect, meta, annotation, onSave(prompt), onDelete, onClose}
   */
  openCard({ rect, meta, annotation, onSave, onDelete, onClose }) {
    this.closeCard();
    const card = el('div', 'card');

    const head = el('div', 'card-head');
    const chip = el('span', 'chip', meta.tag);
    chip.title = meta.selector;
    const sub = el('span', 'card-sub', [meta.id && '#' + meta.id, meta.role, meta.component].filter(Boolean).join(' · '));
    const close = el('button', 'btn-icon', '×');
    close.title = 'Close (Esc)';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose?.();
    });
    head.append(chip, sub, close);

    const attrs = el('div', 'attrs');
    const rows = [];
    if (meta.id) rows.push(['id', meta.id]);
    if (meta.name) rows.push(['name', meta.name]);
    if (meta.type) rows.push(['type', meta.type]);
    if (meta.role) rows.push(['role', meta.role]);
    if (meta.testid) rows.push([meta.testidAttr || 'testid', meta.testid]);
    if (meta.accessibleName) rows.push(['label', meta.accessibleName]);
    if (meta.classes?.length) {
      const shown = meta.classes.slice(0, 3).join(' ');
      const rest = meta.classCount - Math.min(3, meta.classes.length);
      rows.push(['classes', rest > 0 ? `${shown} +${rest}` : shown, meta.classes.join(' ')]);
    }
    if (meta.componentChain?.length) rows.push(['component', meta.componentChain.slice(0, 2).join(' ← ')]);

    for (const [k, v, full] of rows) {
      const row = el('div', 'attr');
      row.append(el('span', 'k', k));
      const value = el('span', 'v', v);
      value.title = full || v;
      if (full) {
        value.classList.add('more');
        value.addEventListener('click', () => {
          value.textContent = value.textContent === full ? v : full;
          this.repositionCard(rect);
        });
      }
      row.append(value);
      attrs.append(row);
    }

    const input = el('textarea', 'prompt');
    input.rows = 3;
    input.placeholder = 'What should change here?';
    input.value = annotation?.prompt || '';
    input.spellcheck = false;

    const foot = el('div', 'card-foot');
    const hint = el('div', 'hint', '⌘↵ to save');
    const save = el('button', 'btn btn-primary', annotation ? 'Update' : 'Save');
    save.disabled = !input.value.trim();

    const remove = el('button', 'btn btn-danger', 'Delete');
    remove.hidden = !annotation;

    input.addEventListener('input', () => {
      save.disabled = !input.value.trim();
      save.textContent = annotation ? 'Update' : 'Save';
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!save.disabled) commit();
      }
    });

    const commit = () => {
      const text = input.value.trim();
      if (!text) return;
      onSave?.(text);
    };
    save.addEventListener('click', commit);
    remove.addEventListener('click', () => onDelete?.());

    foot.append(hint, remove, save);
    card.append(head, attrs, input, foot);
    this.cards.append(card);

    card.style.visibility = 'hidden';
    const box = card.getBoundingClientRect();
    this.cardState = { el: card, rect: rectOf(rect) };
    this.placeCard(box.width, box.height);
    card.style.visibility = 'visible';
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);

    return card;
  }

  placeCard(w, h) {
    const state = this.cardState;
    if (!state) return;
    const p = place(state.rect, w, h, window.innerWidth, window.innerHeight, 'top');
    state.el.style.left = `${p.left}px`;
    state.el.style.top = `${p.top}px`;
  }

  /** Called every frame while active: the card follows its element. */
  repositionCard(rect) {
    const state = this.cardState;
    if (!state) return;
    if (rect) state.rect = rectOf(rect);
    const box = state.el.getBoundingClientRect();
    this.placeCard(box.width, box.height);
  }

  closeCard() {
    this.cardState?.el.remove();
    this.cardState = null;
  }

  cardInput() {
    return this.cardState?.el.querySelector('.prompt') || null;
  }

  hasCard() {
    return !!this.cardState;
  }

  // --- markers -------------------------------------------------------------

  /** items: [{index, rect, onOpen}] */
  renderMarkers(items) {
    this.markers.replaceChildren();
    for (const item of items) {
      const marker = el('div', 'marker', String(item.index));
      marker.title = item.title || '';
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        item.onOpen();
      });
      this.markers.append(marker);
      item.node = marker;
      this.positionMarker(item);
    }
  }

  positionMarker(item) {
    const node = item.node;
    if (!node) return;
    const r = item.rect;
    if (!r || r.width === 0) {
      node.hidden = true;
      return;
    }
    node.hidden = r.bottom < 0 || r.top > window.innerHeight;
    node.style.left = `${clamp(r.left, 12, window.innerWidth - 12)}px`;
    node.style.top = `${clamp(r.top, 12, window.innerHeight - 12)}px`;
  }

  // --- hud -----------------------------------------------------------------

  /** state: {annotations: [{index, selector, prompt}], collapsed} */
  renderHud(state, handlers) {
    if (!this.hudEl) {
      this.hudEl = el('div', 'hud');
      this.root.append(this.hudEl);
      this.bindHudDrag();
    }
    const hud = this.hudEl;
    hud.classList.toggle('collapsed', !!state.collapsed);
    hud.replaceChildren();

    const head = el('div', 'hud-head');
    const brand = el('span', 'brand');
    brand.append(el('i'), el('span', '', 'taptap'));
    const count = el('span', 'count', String(state.annotations.length));
    const fold = el('button', 'btn-icon', state.collapsed ? '▾' : '▴');
    fold.title = state.collapsed ? 'Expand' : 'Collapse';
    fold.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onToggle?.();
    });
    head.append(brand, count, fold);

    const list = el('div', 'hud-list');
    if (!state.annotations.length) {
      list.append(el('div', 'hud-empty', 'Tap an element on the page to annotate it.'));
    }
    for (const item of state.annotations) {
      const row = el('div', 'item');
      row.append(el('div', 'n', String(item.index)));
      const body = el('div', 'body');
      body.append(el('div', 'sel', item.selector || item.tag || ''));
      body.append(el('div', 'txt', item.prompt));
      const del = el('button', 'btn-icon', '×');
      del.title = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onDelete?.(item.index);
      });
      row.append(body, del);
      row.addEventListener('click', () => handlers.onOpen?.(item.index));
      list.append(row);
    }

    const foot = el('div', 'hud-foot');
    const reset = el('button', 'btn btn-ghost', state.confirmReset ? 'Sure?' : 'Reset');
    reset.title = 'Remove every annotation on this page';
    reset.disabled = !state.annotations.length;
    reset.addEventListener('click', () => handlers.onReset?.());
    const submit = el('button', 'btn btn-submit', 'Submit');
    submit.disabled = !state.annotations.length;
    submit.style.marginLeft = 'auto';
    submit.addEventListener('click', () => handlers.onSubmit?.());
    foot.append(reset, submit);

    hud.append(head, list, foot);

    if (!hud.style.left) {
      const width = hud.getBoundingClientRect().width || 296;
      hud.style.left = `${Math.max(MARGIN, window.innerWidth - width - 16)}px`;
      hud.style.top = '16px';
    }
    this.clampHud();
  }

  clampHud() {
    const hud = this.hudEl;
    if (!hud || !hud.isConnected) return;
    const box = hud.getBoundingClientRect();
    const left = clamp(parseFloat(hud.style.left || '0') || 0, MARGIN, window.innerWidth - box.width - MARGIN);
    const top = clamp(parseFloat(hud.style.top || '0') || 0, MARGIN, window.innerHeight - box.height - MARGIN);
    hud.style.left = `${left}px`;
    hud.style.top = `${top}px`;
  }

  setHudPos(pos) {
    if (!this.hudEl) return;
    this.hudEl.style.left = `${pos.x}px`;
    this.hudEl.style.top = `${pos.y}px`;
    this.clampHud();
  }

  hudPos() {
    if (!this.hudEl) return null;
    return { x: parseFloat(this.hudEl.style.left) || 0, y: parseFloat(this.hudEl.style.top) || 0 };
  }

  bindHudDrag() {
    let drag = null;
    const down = (e) => {
      if (e.target.closest('button')) return;
      const box = this.hudEl.getBoundingClientRect();
      drag = { dx: e.clientX - box.left, dy: e.clientY - box.top };
      e.preventDefault();
      e.stopPropagation();
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    };
    const move = (e) => {
      if (!drag) return;
      this.hudEl.style.left = `${e.clientX - drag.dx}px`;
      this.hudEl.style.top = `${e.clientY - drag.dy}px`;
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      this.clampHud();
      this.onHudMove(this.hudPos());
    };
    // The header element is rebuilt on every render, so listen on the panel itself.
    this.hudEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hud-head')) down(e);
    });
  }

  // --- prompt modal --------------------------------------------------------

  showPrompt({ text, count, onCopy, onClose }) {
    this.hidePrompt();
    const modal = el('div', 'modal');
    const box = el('div', 'modal-box');

    const head = el('div', 'modal-head');
    head.append(el('span', 'modal-title', 'Prompt'));
    head.append(el('span', 'modal-sub', `${count} annotation${count === 1 ? '' : 's'} · paste into any agent session`));
    const close = el('button', 'btn-icon', '×');
    close.addEventListener('click', () => {
      onClose?.();
    });
    head.append(close);

    const area = el('textarea');
    area.readOnly = true;
    area.value = text;
    area.spellcheck = false;

    const foot = el('div', 'modal-foot');
    const hint = el('div', 'hint', 'Copied to the clipboard when you press Copy.');
    const copyBtn = el('button', 'btn btn-submit', 'Copy');
    const closeBtn = el('button', 'btn btn-ghost', 'Close');
    copyBtn.addEventListener('click', async () => {
      const ok = await onCopy?.(text);
      if (ok) {
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = 'Copy';
        }, 1600);
      } else {
        area.focus();
        area.select();
        hint.textContent = 'Press ⌘C to copy the selected text.';
      }
    });
    closeBtn.addEventListener('click', () => onClose?.());
    foot.append(hint, closeBtn, copyBtn);

    box.append(head, area, foot);
    modal.append(box);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) onClose?.();
    });
    this.root.append(modal);
    this.modalEl = modal;
    area.focus();
    area.setSelectionRange(0, 0);
    area.scrollTop = 0;
  }

  hidePrompt() {
    this.modalEl?.remove();
    this.modalEl = null;
  }

  hasPrompt() {
    return !!this.modalEl;
  }

  toast(message, ms = 2400) {
    this.toastEl?.remove();
    const node = el('div', 'toast', message);
    this.root.append(node);
    this.toastEl = node;
    setTimeout(() => {
      if (this.toastEl === node) {
        node.remove();
        this.toastEl = null;
      }
    }, ms);
  }
}
