// What built this page. Two layers:
//  1. detectPage() — DOM signals only, always available, no page-world access.
//  2. probe() — asks a helper injected into the page's own world for the component
//     name. Framework internals (React fibers, Vue instances) live as expandos on
//     page-world wrappers, which an isolated content script cannot see.

const SCRIPT_HINTS = [
  { re: /\/_next\/static\/chunks\/app\//, name: 'Next.js', router: 'App Router' },
  { re: /\/_next\/static\//, name: 'Next.js', router: '' },
  { re: /\/_nuxt\//, name: 'Nuxt', router: '' },
  { re: /\/_app\/immutable\//, name: 'SvelteKit', router: '' },
  { re: /\/_astro\//, name: 'Astro', router: '' },
  { re: /\/_gatsby\//, name: 'Gatsby', router: '' },
  { re: /\/@vite\/client/, name: 'Vite', router: '' },
];

const has = (sel, root = document) => {
  try {
    return !!root.querySelector(sel);
  } catch {
    return false;
  }
};

/** DOM-only stack hints. Cheap enough to run on every activation. */
export function detectPage(doc = document) {
  const srcs = [...doc.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') || '');
  const joined = srcs.join(' ');
  const out = { name: '', version: '', router: '', signals: [] };

  for (const hint of SCRIPT_HINTS) {
    if (hint.re.test(joined)) {
      out.name = hint.name;
      out.router = hint.router;
      out.signals.push(`script ${hint.re.source}`);
      break;
    }
  }

  if (!out.name && doc.querySelector('#__NEXT_DATA__')) {
    out.name = 'Next.js';
    out.router = 'Pages Router';
    out.signals.push('#__NEXT_DATA__');
  }
  if (!out.name && (has('#__nuxt', doc) || has('[data-n-head]', doc))) {
    out.name = 'Nuxt';
    out.signals.push('#__nuxt');
  }
  if (!out.name && has('#___gatsby', doc)) {
    out.name = 'Gatsby';
    out.signals.push('#___gatsby');
  }
  if (!out.name && has('astro-island', doc)) {
    out.name = 'Astro';
    out.signals.push('astro-island');
  }

  const ngRoot = doc.querySelector('[ng-version]');
  if (ngRoot) {
    out.name = out.name || 'Angular';
    out.version = ngRoot.getAttribute('ng-version') || '';
    out.signals.push('ng-version');
  }

  if (!out.name && has('[data-v-app]', doc)) {
    out.name = 'Vue';
    out.signals.push('data-v-app');
  }
  if (!out.name && has('[data-svelte-h]', doc)) {
    out.name = 'Svelte';
    out.signals.push('data-svelte-h');
  }
  if (!out.name && has('[data-reactroot]', doc)) {
    out.name = 'React';
    out.signals.push('data-reactroot');
  }
  if (!out.name && /react(-dom)?[.\-/]/.test(joined)) {
    out.name = 'React';
    out.signals.push('react bundle');
  }
  if (!out.name && has('[data-hk]', doc)) {
    out.name = 'Solid';
    out.signals.push('data-hk');
  }
  if (!out.name && has('[x-data]', doc)) {
    out.name = 'Alpine.js';
    out.signals.push('x-data');
  }

  out.summary = [out.name && out.version ? `${out.name} ${out.version}` : out.name, out.router].filter(Boolean).join(' · ');
  return out;
}

export function stackLine(page, probe) {
  const parts = [];
  if (page?.summary) parts.push(page.summary);
  if (probe?.framework && probe.framework !== page?.name) parts.push(probe.framework);
  if (probe?.component) parts.push(`component ${probe.component}`);
  return parts.join(' · ');
}

// --- page-world probe -------------------------------------------------------
// Sent with chrome.scripting.executeScript({ world: 'MAIN' }), so it must not
// reference anything outside its own body.

export function installProbe() {
  if (window.__taptapProbe) return;
  window.__taptapProbe = true;

  const nameOf = (type) => {
    if (!type) return '';
    if (typeof type === 'function') return type.displayName || type.name || '';
    if (typeof type === 'object') {
      return (
        type.displayName ||
        type.name ||
        (type.render && (type.render.displayName || type.render.name)) ||
        (type.type && (type.type.displayName || type.type.name)) ||
        ''
      );
    }
    return '';
  };

  // Production bundles minify component names to one or two letters; `x ← m ← n`
  // tells an agent nothing, so a short name never counts as a name.
  const usefulName = (name) =>
    typeof name === 'string' && name.length > 2 && !/^_|_$|\$/.test(name);

  const reactInfo = (el) => {
    const key = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
    );
    if (!key) return null;
    let fiber = el[key];
    const chain = [];
    for (let i = 0; fiber && i < 400 && chain.length < 6; i++) {
      const t = fiber.type;
      // A provider's type is a context object, not a component: it carries no file.
      const isComponent = typeof t === 'function' || (t && typeof t === 'object' && (t.render || t.type));
      const name = isComponent ? nameOf(t) : '';
      if (usefulName(name) && !/^(Fragment|Suspense|Provider|Consumer)$/.test(name) && !/(Context|Provider|Consumer)$/.test(name)) {
        if (!chain.includes(name)) chain.push(name);
      }
      fiber = fiber.return;
    }
    let version = '';
    try {
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (hook?.renderers) {
        for (const r of hook.renderers.values()) {
          if (r?.version) version = r.version;
        }
      }
    } catch {}
    return { framework: 'React', version, chain };
  };

  const vueInfo = (el) => {
    let inst = el.__vueParentComponent || el.__vue_vnode?.component || null;
    if (!inst) return null;
    const chain = [];
    for (let i = 0; inst && i < 60 && chain.length < 6; i++) {
      const t = inst.type || {};
      const name = t.__name || t.name || '';
      if (usefulName(name) && !chain.includes(name)) chain.push(name);
      inst = inst.parent || null;
    }
    let version = '';
    try {
      version = el.__vue_app__?.version || window.__vue_app__?.version || '';
    } catch {}
    return { framework: 'Vue', version, chain };
  };

  const angularInfo = (el) => {
    const ng = window.ng;
    if (!ng) return null;
    const chain = [];
    try {
      let cmp = ng.getOwningComponent ? ng.getOwningComponent(el) : null;
      for (let i = 0; cmp && i < 20 && chain.length < 6; i++) {
        const name = cmp.constructor?.name || '';
        if (usefulName(name) && !chain.includes(name)) chain.push(name);
        cmp = cmp.__ngContext__ ? null : null;
      }
      if (!chain.length && ng.getComponent) {
        const c = ng.getComponent(el);
        if (usefulName(c?.constructor?.name)) chain.push(c.constructor.name);
      }
    } catch {}
    if (!chain.length) return null;
    return { framework: 'Angular', version: '', chain };
  };

  const svelteInfo = (el) => {
    const meta = el.__svelte_meta;
    if (!meta) return null;
    return { framework: 'Svelte', version: '', chain: meta.file ? [meta.file.split('/').pop()] : [] };
  };

  const probe = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const info =
      reactInfo(el) ||
      vueInfo(el) ||
      angularInfo(el) ||
      svelteInfo(el) ||
      { framework: '', version: '', chain: [] };
    return {
      tag: el.localName,
      framework: info.framework,
      version: info.version || '',
      chain: info.chain,
      component: info.chain[0] || '',
      parentComponent: info.chain[1] || '',
    };
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__taptap !== 'probe' || typeof data.token !== 'string') return;
    let result = null;
    try {
      result = probe(Number(data.x), Number(data.y));
    } catch {
      result = null;
    }
    window.postMessage({ __taptap: 'probe-result', token: data.token, data: result }, '*');
  });
}

const pending = new Map();
let seq = 0;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__taptap !== 'probe-result') return;
    const resolve = pending.get(data.token);
    if (!resolve) return;
    pending.delete(data.token);
    resolve(data.data || null);
  });
}

/** Component info for the element at a point, or null when the probe is not there. */
export function probe(x, y, timeout = 220) {
  listen();
  return new Promise((resolve) => {
    const token = `tt${++seq}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pending.delete(token);
      resolve(null);
    }, timeout);
    pending.set(token, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    window.postMessage({ __taptap: 'probe', token, x: Math.round(x), y: Math.round(y) }, '*');
  });
}
