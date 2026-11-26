// The `states` pass in a real browser: a control under a real pointer and with keyboard focus, and
// the texts that are painted differently there than at rest. The page is test/fixtures/checks/
// states.html (read its README). Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { statesPass } from '../../../../src/checks/adapters/facts/playwright-states.ts';
import type { StateRead } from '../../../../src/checks/domain/page/facts.ts';
import { NO_BROWSER } from '../site.ts';
import { closeBrowser, openBrowser, withFixture } from './fixture-page.ts';

const TEST_MS = 120_000;

before(openBrowser);
after(closeBrowser);

test('the states pass reads a control only where its text is painted differently', {
  timeout: TEST_MS,
}, async (t) => {
  const result = await withFixture('states.html', async (page, facts) => {
    const reads = await statesPass(page);
    const left = await page.evaluate(() => ({
      focused: document.activeElement === document.body || document.activeElement === null,
      style: document.querySelector('style#kitvas-states-style') !== null,
    }));
    return { reads, facts, left };
  });
  if (result === undefined) return t.skip(NO_BROWSER);
  const { reads, facts, left } = result;
  const idOf = (read: StateRead): string | null | undefined => facts.nodes[read.node]?.domId;
  assert.deepEqual(
    reads.map((read) => [idOf(read), read.state]),
    [
      ['toggle', 'hover'],
      ['recolour', 'hover'],
      ['focusy', 'focus'],
    ],
  );
  const [toggle, recolour, focusy] = reads;
  // The dark toggle that is on: hover paints the background white under the white text.
  assert.equal(toggle?.on, true);
  assert.equal(toggle?.name, 'Weekly');
  assert.equal(toggle?.texts.length, 1);
  assert.equal(toggle?.texts[0]?.ink, toggle?.texts[0]?.ground);
  assert.equal(toggle?.texts[0]?.unsure, false);
  assert.equal(toggle?.texts[0]?.large, false);
  // Colours that change under the pointer.
  assert.equal(recolour?.on, false);
  assert.equal(recolour?.texts[0]?.ground, '#1d4ed8ff');
  assert.equal(recolour?.texts[0]?.ink, '#ffffffff');
  // Focus changes the text colour only.
  assert.equal(focusy?.texts[0]?.ink, '#eeeeeeff');
  assert.equal(focusy?.texts[0]?.ground, '#ffffffff');
  // The page is as it was: nothing focused, the added style gone.
  assert.deepEqual(left, { focused: true, style: false });
});

test('the states pass gives nothing on a page with no control', { timeout: TEST_MS }, async (t) => {
  const reads = await withFixture('text.html', (page) => statesPass(page));
  if (reads === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(reads, []);
});
