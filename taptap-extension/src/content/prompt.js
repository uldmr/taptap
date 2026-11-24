// The prompt is the product: what the user typed, wrapped in enough page context
// that an agent can find the element and know what it is looking at.

const clean = (v) => String(v ?? '').replace(/`/g, "'").replace(/\s+/g, ' ').trim();
const code = (v) => '`' + clean(v) + '`';
const quote = (v) => '"' + clean(v).replace(/"/g, '\\"') + '"';

function attrLine(meta) {
  const parts = [];
  if (meta.id) parts.push(`id ${code(meta.id)}`);
  if (meta.name) parts.push(`name ${code(meta.name)}`);
  if (meta.type) parts.push(`type ${code(meta.type)}`);
  if (meta.testid) parts.push(`${meta.testidAttr || 'data-testid'} ${code(meta.testid)}`);
  if (meta.role) parts.push(`role ${code(meta.role)}`);
  if (meta.ariaLabel) parts.push(`aria-label ${quote(meta.ariaLabel)}`);
  return parts.join(' · ');
}

function classLine(meta) {
  if (!meta.classes?.length) return '';
  const shown = meta.classes.slice(0, 4).map(code).join(' ');
  const hidden = (meta.classCount || meta.classes.length) - Math.min(4, meta.classes.length);
  return shown + (hidden > 0 ? ` (+${hidden} more)` : '');
}

function componentLine(meta) {
  const chain = meta.componentChain?.length ? meta.componentChain : meta.component ? [meta.component] : [];
  const named = chain.length ? chain.map(code).join(' ← ') : '';
  const framework = [meta.stack, meta.stackVersion].filter(Boolean).join(' ');
  if (!named && !framework) return '';
  return [framework, named].filter(Boolean).join(' · ');
}

/** One markdown block per annotation. */
export function annotationBlock(annotation, number) {
  const meta = annotation.meta || {};
  const lines = [];
  const title = `${meta.tag || 'element'}${meta.testid ? ` [${meta.testidAttr || 'data-testid'}="${clean(meta.testid)}"]` : meta.id ? '#' + clean(meta.id) : ''}`;
  lines.push(`## ${number}. ${title}`);
  lines.push('');
  lines.push(`- selector: ${code(meta.selector || meta.path || meta.tag)}`);
  const attrs = attrLine(meta);
  if (attrs) lines.push(`- attributes: ${attrs}`);
  const classes = classLine(meta);
  if (classes) lines.push(`- classes: ${classes}`);
  const component = componentLine(meta);
  if (component) lines.push(`- component: ${component}`);
  if (meta.accessibleName) lines.push(`- name: ${quote(meta.accessibleName)}`);
  if (meta.path && meta.path !== meta.selector) lines.push(`- path: ${code(meta.path)}`);
  if (meta.text) lines.push(`- text: ${quote(meta.text)}`);
  if (meta.parent) {
    const p = meta.parent;
    const bits = [`${code(p.tag)}`];
    if (p.selector && p.selector !== p.tag) bits.push(code(p.selector));
    if (p.component) bits.push(`component ${code(p.component)}`);
    lines.push(`- parent: ${bits.join(' · ')}`);
  }
  if (meta.html) lines.push(`- html: ${code(meta.html)}`);
  lines.push('');
  lines.push(`**Request:** ${annotation.prompt.trim()}`);
  return lines.join('\n');
}

/**
 * @param {{page: object, annotations: object[]}} input
 *   page: { url, title, viewport: {width, height, dpr}, stack: {summary}, probe: {component} }
 * @returns {string} markdown ready to paste into any agent session
 */
export function buildPrompt({ page, annotations }) {
  const items = annotations.filter((a) => a.prompt && a.prompt.trim());
  const head = [`# Page annotations — ${clean(page.title) || clean(page.url)}`, '', `- page: ${code(page.url)}`];
  if (page.stack?.summary) head.push(`- stack: ${clean(page.stack.summary)}`);
  if (page.probe?.component) head.push(`- components: ${code(page.probe.component)}`);
  if (page.viewport) head.push(`- viewport: ${page.viewport.width}×${page.viewport.height} @${page.viewport.dpr}x`);
  head.push(`- annotations: ${items.length}`);
  head.push(
    '',
    'Each item below is a change request. Apply it to the element it names, in the file this',
    'page is built from. Do not restyle anything the request does not mention.',
    '',
  );

  const body = items.map((a, i) => annotationBlock(a, i + 1)).join('\n\n');
  return `${head.join('\n')}\n${body}\n`;
}

/** The same content as data, for the agent bridge and for tests. */
export function buildPayload({ page, annotations }) {
  return {
    url: page.url,
    title: page.title,
    stack: page.stack?.summary || '',
    components: page.probe?.chain || [],
    viewport: page.viewport || null,
    annotations: annotations
      .filter((a) => a.prompt && a.prompt.trim())
      .map((a) => ({
        prompt: a.prompt.trim(),
        selector: a.meta?.selector || '',
        path: a.meta?.path || '',
        anchor: a.anchor || null,
        element: a.meta || null,
      })),
  };
}
