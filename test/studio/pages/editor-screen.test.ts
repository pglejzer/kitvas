import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editBlock } from '../../../src/studio/pages/editor/editor-bar.ts';
import { html } from '../../../src/studio/pages/html.ts';
import { pausedView } from '../../../src/studio/pages/paused.ts';
import { page } from '../../../src/studio/pages/shell.ts';
import { SKIN_EDITOR_BODY } from '../../../src/studio/pages/skin/editor/shell/body.ts';
import { t } from '../../helpers/translate.ts';

// The screen's own rules; what an area's rules may hold at all is in skin/area-rules.test.ts.
const SKIN = SKIN_EDITOR_BODY;

test('only the latest built version, outside compare, can be edited; else the reason', () => {
  const latest = { built: true, version: 3, latest: 3, compare: null };
  assert.equal(editBlock(latest), null);
  assert.equal(editBlock({ ...latest, version: 2 }), 'old');
  assert.equal(editBlock({ ...latest, built: false }), 'unbuilt');
  assert.equal(editBlock({ ...latest, compare: 2 }), 'compare');
  // The original of a rework is a comparison too.
  assert.equal(editBlock({ ...latest, compare: 0 }), 'compare');
  // Comparing is named first: stopping it is the one step to take.
  assert.equal(editBlock({ built: false, version: 1, latest: 3, compare: 2 }), 'compare');
});

test('the screen chrome drops the studio links, marks the body and keeps the paused view', () => {
  const frame = {
    title: 'Shop',
    nonce: 'N',
    skin: '',
    nav: { t, current: null },
    body: html`<main></main>`,
  };
  const screen = page({ ...frame, chrome: 'screen' });
  assert.ok(screen.includes('<body class="screen">'));
  assert.ok(!screen.includes('<header class="k-bar">'));
  assert.ok(screen.includes(pausedView(t).text));
  const plain = page(frame);
  assert.ok(plain.includes('<header class="k-bar">'));
  assert.ok(!plain.includes('class="screen"'));
});

test('the window never scrolls: the screen is the bar over a body that fills the rest', () => {
  assert.match(SKIN, /html:has\(> body\.screen\) \{[^}]*overflow: hidden/);
  assert.match(SKIN, /body\.screen \{[^}]*height: 100dvh;[^}]*overflow: hidden;/);
  assert.match(
    SKIN,
    /\.side-screen \{[^}]*grid-template-rows: var\(--st-size-bar\) minmax\(0, 1fr\)/,
  );
  // The rail, the left panel, the canvas, the right panel; the panels' widths come from the script.
  assert.ok(SKIN.includes('grid-template-columns: var(--st-size-rail) auto minmax(0, 1fr) auto;'));
  assert.ok(SKIN.includes('width: var(--side-left, var(--st-size-left));'));
  assert.ok(SKIN.includes('width: var(--side-right, var(--st-size-right));'));
  // A pane host never scrolls itself: what it holds scrolls in one `.k-scroll`.
  assert.match(
    SKIN,
    /\.side-panel > \[data-pane\] \{[^}]*flex-direction: column;[^}]*overflow: hidden;/,
  );
});

test('a folded left panel takes no room and a folded right one is its rail; below 1100 px they open over the canvas', () => {
  assert.ok(
    SKIN.includes(
      '.side-panel[data-side="left"][data-folded] { width: 0; margin-left: 0; visibility: hidden; }',
    ),
  );
  assert.ok(
    SKIN.includes('.side-panel[data-side="right"][data-folded] { width: var(--st-size-rail); }'),
  );
  const narrow = SKIN.split('@media (max-width: 1099.98px)')[1] ?? '';
  assert.match(narrow, /\.side-panel\[data-overlay\]\[data-side\] \{[^}]*position: absolute;/);
  assert.ok(narrow.includes('.side-grip[data-grip] { display: none; }'));
});

test('a panel moves only while the script marks the screen, so a drag and a resize take effect at once', () => {
  assert.match(SKIN, /\.side-screen\[data-moving\] \.side-panel \{\s*transition:/);
  const still = SKIN.replaceAll(/\.side-screen\[data-moving\][^{]*\{[^}]*\}/g, '');
  assert.doesNotMatch(still, /\.side-panel[^{]*\{[^}]*transition/);
});
