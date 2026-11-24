import assert from 'node:assert/strict';
import { test } from 'node:test';
import { annotationBlock, buildPayload, buildPrompt } from '../src/content/prompt.js';

const page = {
  url: 'https://example.com/checkout?step=2',
  title: 'Checkout — Example',
  stack: { summary: 'Next.js · App Router' },
  viewport: { width: 1440, height: 900, dpr: 2 },
};

const annotation = {
  prompt: 'Make the label float above the field.',
  anchor: { candidates: [{ kind: 'testid', selector: '[data-testid="email"]', index: 0, total: 1 }] },
  meta: {
    tag: 'input',
    id: 'email',
    name: 'email',
    type: 'email',
    role: 'textbox',
    testid: 'email',
    testidAttr: 'data-testid',
    classes: ['EmailField_input'],
    classCount: 3,
    selector: '[data-testid="email"]',
    path: 'body > form:nth-of-type(1) > input:nth-of-type(3)',
    accessibleName: 'Email address',
    text: '',
    html: '<input id="email" name="email" type="email">',
    stack: 'React',
    component: 'EmailField',
    componentChain: ['EmailField', 'CheckoutForm'],
    parent: { tag: 'form', selector: '[data-testid="checkout-form"]', component: 'CheckoutForm' },
  },
};

test('buildPrompt carries page context, selector and request', () => {
  const text = buildPrompt({ page, annotations: [annotation] });
  assert.match(text, /^# Page annotations — Checkout — Example/);
  assert.match(text, /- page: `https:\/\/example\.com\/checkout\?step=2`/);
  assert.match(text, /- stack: Next\.js · App Router/);
  assert.match(text, /- viewport: 1440×900 @2x/);
  assert.match(text, /- annotations: 1/);
  assert.match(text, /## 1\. input \[data-testid="email"\]/);
  assert.match(text, /- selector: `\[data-testid="email"\]`/);
  assert.match(text, /- classes: `EmailField_input` \(\+2 more\)/);
  assert.match(text, /- component: React · `EmailField` ← `CheckoutForm`/);
  assert.match(text, /- parent: `form` · `\[data-testid="checkout-form"\]` · component `CheckoutForm`/);
  assert.match(text, /\*\*Request:\*\* Make the label float above the field\./);
});

test('buildPrompt keeps the markdown blocks apart', () => {
  const text = buildPrompt({ page, annotations: [annotation] });
  assert.match(text, /^# Page annotations — Checkout — Example\n\n- page:/);
  assert.match(text, /mention\.\n\n## 1\. input/);
});

test('buildPrompt drops annotations without a request and numbers the rest', () => {
  const second = { prompt: 'Remove the shadow.', meta: { tag: 'div', selector: 'div.card' } };
  const text = buildPrompt({ page, annotations: [annotation, { prompt: '   ', meta: {} }, second] });
  assert.match(text, /- annotations: 2/);
  assert.match(text, /## 2\. div/);
  assert.doesNotMatch(text, /## 3\./);
});

test('annotationBlock escapes backticks so the markdown stays intact', () => {
  const block = annotationBlock({ prompt: 'use `x` here', meta: { selector: 'a`b' } }, 1);
  assert.match(block, /- selector: `a'b`/);
  assert.match(block, /\*\*Request:\*\* use `x` here/);
});

test('buildPayload keeps the data an agent bridge needs', () => {
  const payload = buildPayload({ page, annotations: [annotation, { prompt: '' }] });
  assert.equal(payload.annotations.length, 1);
  assert.equal(payload.url, page.url);
  assert.equal(payload.stack, 'Next.js · App Router');
  assert.equal(payload.annotations[0].selector, '[data-testid="email"]');
  assert.equal(payload.annotations[0].anchor.candidates[0].kind, 'testid');
  assert.equal(payload.viewport.dpr, 2);
});
