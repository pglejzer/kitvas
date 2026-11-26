// The `press` pass in a real browser: what using each control did to the page. The page is
// test/fixtures/checks/press.html (read its README). Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { effectOf, pressPass } from '../../../../src/checks/adapters/facts/playwright-press.ts';
import { NO_BROWSER } from '../site.ts';
import { closeBrowser, openBrowser, withFixture } from './fixture-page.ts';

const TEST_MS = 120_000;

before(openBrowser);
after(closeBrowser);

test('the effect is page for anything outside the scope, a dialog, an address or moved focus', () => {
  const none = { own: false, outside: false, moved: false, address: false };
  assert.equal(effectOf(none, 0), 'none');
  assert.equal(effectOf({ ...none, own: true }, 0), 'own');
  assert.equal(effectOf({ ...none, own: true, outside: true }, 0), 'page');
  assert.equal(effectOf(none, 1), 'page');
  assert.equal(effectOf({ ...none, address: true }, 0), 'page');
  assert.equal(effectOf({ ...none, own: true, moved: true }, 0), 'page');
});

test('the press pass tells what each kind of control did', { timeout: TEST_MS }, async (t) => {
  const reads = await withFixture('press.html', (page) => pressPass(page));
  if (reads === undefined) return t.skip(NO_BROWSER);
  const byName = new Map(reads.map((read) => [read.name, read]));
  const shape = (name: string): [string, string] | undefined => {
    const read = byName.get(name);
    return read === undefined ? undefined : [read.kind, read.effect];
  };
  // Buttons.
  assert.deepEqual(shape('No handler'), ['button', 'none']);
  assert.deepEqual(shape('Own label'), ['button', 'own']);
  assert.deepEqual(shape('Elsewhere'), ['button', 'page']);
  assert.deepEqual(shape('Alerts'), ['button', 'page']);
  // A group of toggles: one read, with the first member that is not on.
  assert.deepEqual(shape('Own B'), ['choice', 'own']);
  assert.deepEqual(shape('Page B'), ['choice', 'page']);
  for (const member of ['Own A', 'Own C', 'Page A', 'Page C']) {
    assert.equal(byName.has(member), false, member);
  }
  // Selects outside a form.
  assert.deepEqual(shape('Plain select'), ['select', 'none']);
  assert.deepEqual(shape('Live select'), ['select', 'page']);
  // A search field that filters a list.
  assert.deepEqual(shape('Search items'), ['search', 'page']);
  // Never used: a select in a form, a submit button in a form, a link.
  for (const name of ['Form select', 'Send', 'Read the billing guide']) {
    assert.equal(byName.has(name), false, name);
  }
  assert.equal(reads.length, 9);
});

test('the press pass gives nothing on a page with no control', { timeout: TEST_MS }, async (t) => {
  const reads = await withFixture('text.html', (page) => pressPass(page));
  if (reads === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(reads, []);
});
