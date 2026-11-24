import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { loadKit, tokensToCss } from '../../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { EDIT_SKIN_SCREEN } from '../../../src/studio/pages/edit-skin/screen.ts';
import { editBlock } from '../../../src/studio/pages/editor-bar.ts';
import { html } from '../../../src/studio/pages/html.ts';
import { pausedView } from '../../../src/studio/pages/paused.ts';
import { page } from '../../../src/studio/pages/shell.ts';
import { SKIN_RULES } from '../../../src/studio/pages/skin.ts';
import { t } from '../../helpers/translate.ts';

const base = loadKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');
const SKIN = EDIT_SKIN_SCREEN;

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
  assert.ok(!screen.includes('<header class="top">'));
  assert.ok(screen.includes(pausedView(t).text));
  const plain = page(frame);
  assert.ok(plain.includes('<body>\n<header class="top">'));
  assert.ok(!plain.includes('class="screen"'));
});

test('the screen skin uses only Base tokens, no colours of its own, and grey text is ink-mid', () => {
  const defined = new Set(
    [...tokensToCss(base.tokens).matchAll(/(--kit-[a-z0-9-]+):/g)].map((match) => match[1]),
  );
  const used = [...SKIN.matchAll(/var\((--kit-[a-z0-9-]+)\)/g)].map((match) => match[1]);
  assert.ok(used.length > 40);
  for (const name of used) assert.ok(defined.has(name), `${name} is a Base token`);
  // `white-space` is a property, not a colour.
  assert.doesNotMatch(SKIN, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b(?!-)/i);
  assert.doesNotMatch(SKIN, /box-shadow|text-shadow|font-family: (?!var)/);
  assert.ok(!SKIN.includes('--kit-color-ink-soft'));
});

test('the window never scrolls: the screen is a bar of 48 px over a body that fills the rest', () => {
  assert.match(SKIN, /html:has\(> body\.screen\) \{[^}]*overflow: hidden/);
  assert.match(SKIN, /body\.screen \{[^}]*height: 100dvh;[^}]*overflow: hidden;/);
  assert.match(
    SKIN,
    /\.draft-page \{[^}]*grid-template-rows: var\(--kit-space-3xl\) minmax\(0, 1fr\)/,
  );
  // Left panel, grip, canvas, grip, right panel; the panels' widths come from the script.
  assert.ok(SKIN.includes('grid-template-columns: auto auto minmax(320px, 1fr) auto auto'));
  assert.ok(SKIN.includes('width: var(--editor-left, 272px)'));
  assert.ok(SKIN.includes('width: var(--editor-right, 320px)'));
  // Each pane scrolls in itself, never sideways.
  assert.match(SKIN, /\.editor-pane \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
});

test('a folded panel is a 40 px rail, and below 1100 px the panels open over the canvas', () => {
  const wide = SKIN.split('@media (min-width: 1100px)')[1] ?? '';
  assert.ok(wide.startsWith(' {\n  .editor-side[data-folded] { width: var(--kit-size-control); }'));
  const narrow = SKIN.split('@media (max-width: 1099.98px)')[1] ?? '';
  assert.match(narrow, /\.editor-side\[data-overlay\] \{[^}]*position: absolute;/);
  assert.match(narrow, /\.editor-grip\[data-grip\] \{ display: none; \}/);
});

test('the old draft layout and the edit toggle are gone from the studio skin', () => {
  assert.ok(!SKIN_RULES.includes('.draft {'));
  assert.ok(!SKIN_RULES.includes('.foot {'));
  assert.ok(!SKIN.includes('.edit-toggle'));
});
