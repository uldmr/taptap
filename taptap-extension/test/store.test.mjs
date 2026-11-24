import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageKey } from '../src/content/store.js';

test('pageKey ignores the query and the hash', () => {
  assert.equal(pageKey('https://example.com/a/b?x=1#top'), 'https://example.com/a/b');
  assert.equal(pageKey('https://example.com/a/b/'), 'https://example.com/a/b');
  assert.equal(pageKey('https://example.com/'), 'https://example.com/');
  assert.equal(pageKey('https://example.com'), 'https://example.com/');
});

test('pageKey keeps the port and the scheme', () => {
  assert.equal(pageKey('http://localhost:3000/hotels/1'), 'http://localhost:3000/hotels/1');
});
