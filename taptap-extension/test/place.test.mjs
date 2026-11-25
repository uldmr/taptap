import assert from 'node:assert/strict';
import { test } from 'node:test';
import { place } from '../src/content/overlay.js';
import { localClass } from '../src/content/anchor.js';

const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test('place prefers the top side when there is room', () => {
  const p = place(rect(400, 300, 200, 100), 340, 200, 1000, 800);
  assert.equal(p.side, 'top');
  assert.equal(p.left, 330);
  assert.equal(p.top, 88);
  assert.equal(p.arrow.axis, 'x');
});

test('place falls back to the bottom when the element sits at the top', () => {
  const p = place(rect(400, 10, 200, 100), 340, 200, 1000, 800);
  assert.equal(p.side, 'bottom');
  assert.equal(p.top, 122);
});

test('place goes sideways when neither top nor bottom fits', () => {
  const p = place(rect(300, 300, 400, 200), 340, 200, 1000, 800, 'top');
  assert.equal(p.side, 'top'); // 300px above is enough for a 200px panel
  const tall = place(rect(300, 100, 400, 600), 340, 200, 1000, 800, 'top');
  assert.equal(tall.side, 'right');
});

test('place keeps the panel inside the viewport', () => {
  const p = place(rect(0, 300, 1000, 100), 340, 200, 1000, 800);
  assert.ok(p.left >= 8);
  assert.ok(p.left + 340 <= 992);
});

test('localClass keeps the stable half of a build-hashed class', () => {
  assert.equal(localClass('HeaderSearch_input__VSV_n'), 'HeaderSearch_input');
  assert.equal(localClass('Header_header--x5dIN'), 'Header_header');
  assert.equal(localClass('css-1x2a3b'), null);
  assert.equal(localClass('sc-bdVaJa'), null);
  assert.equal(localClass('flex'), 'flex');
  assert.equal(localClass('text-sm'), 'text-sm');
});
