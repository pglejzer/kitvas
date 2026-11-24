import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft, States } from '../../../src/drafts/index.ts';
import { choiceLink } from '../../../src/studio/pages/draft-links.ts';
import { dock, type StageInput, stage } from '../../../src/studio/pages/draft-stage.ts';
import { escapeHtml, type Html, html } from '../../../src/studio/pages/html.ts';
import type { DraftChoice } from '../../../src/studio/views/draft-query.ts';
import { t } from '../../helpers/translate.ts';

const DRAFT: Draft = {
  schemaVersion: 1,
  slug: 'shop',
  title: 'Shop',
  kind: 'screen',
  kit: { id: 'base', version: '0.1.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 3, createdAt: '2026-11-22T11:00:00.000Z' },
  ],
};

const STATES: States = {
  schemaVersion: 1,
  default: 'filled',
  states: [
    { id: 'filled', label: 'With data' },
    { id: 'empty', label: 'Empty' },
  ],
};

const SRC = 'http://127.0.0.1:5001/f/k3y/shop/v3/html/index.html?state=filled';

const input = (fields: Partial<StageInput> = {}): StageInput => ({
  t,
  host: '127.0.0.1:5000',
  width: 390,
  name: 'Shop',
  version: 3,
  built: true,
  src: SRC,
  slug: 'shop',
  compare: null,
  ...fields,
});

const textOf = (value: Html | ''): string => (value === '' ? '' : value.text);
const count = (text: string, part: string): number => text.split(part).length - 1;

const CHOICE: DraftChoice = { version: 3, state: 'filled', width: 390 };
const docked = (choice: DraftChoice = CHOICE): string =>
  textOf(dock({ t, choice, states: STATES, link: choiceLink(DRAFT, choice) }));

test('one version shows as one card in the canvas, with the scroller, sizer, world and shield', () => {
  const text = stage(input()).text;
  assert.ok(text.startsWith('<div class="canvas-scroll" data-canvas="scroll">'));
  assert.ok(text.includes('<div class="canvas-sizer" data-canvas="sizer">'));
  assert.ok(text.includes('<div class="canvas-world" data-canvas="world">'));
  assert.ok(text.includes('<div class="canvas-shield" data-canvas="shield" hidden></div>'));
  assert.equal(count(text, '<figure class="canvas-card'), 1);
  assert.equal(count(text, '<iframe '), 1);
  assert.ok(text.includes('data-card="current"'));
  assert.ok(text.includes('data-frame="current"'));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(!text.includes('compare-summary'));
});

test('the shield lies over the world, inside the sizer, so it takes a drag over any card', () => {
  const text = stage(input()).text;
  const world = text.indexOf('data-canvas="world"');
  const shield = text.indexOf('data-canvas="shield"');
  assert.ok(world > 0 && shield > world);
  assert.ok(text.endsWith('data-canvas="shield" hidden></div></div></div>'));
});

test('the caption above the card names the version on the left and the size on the right', () => {
  const text = stage(input()).text;
  const caption = /<figcaption class="card-caption">(.*?)<\/figcaption>/.exec(text)?.[1] ?? '';
  assert.equal(
    caption,
    '<span class="card-name">Version 3</span>' +
      '<span class="card-size" data-card-size>390 px wide</span>',
  );
  // Above: the caption comes before the frame.
  assert.ok(text.indexOf('<figcaption') < text.indexOf('<iframe'));
});

test('the frame keeps its sandbox, its channel and the width in its markup', () => {
  const text = stage(input({ width: 768 })).text;
  const frame = /<iframe [^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(frame.includes('width="768"'));
  assert.ok(frame.includes('sandbox="allow-scripts"'));
  assert.ok(frame.includes('referrerpolicy="no-referrer"'));
  assert.ok(frame.includes('title="Prototype of Shop"'));
  assert.match(frame, /data-frame="current" data-channel="[A-Za-z0-9_-]{16,64}"/);
  assert.match(
    frame,
    /src="http:\/\/127\.0\.0\.1:5001\/f\/k3y\/shop\/v3\/html\/index\.html\?state=filled#kitvas=[A-Za-z0-9_-]{16,64}&amp;studio=5000"/,
  );
});

test('a custom width shows in the card instead of the preset', () => {
  const text = stage(input({ width: 390, view: 1000 })).text;
  assert.ok(text.includes('width="1000"'));
  assert.ok(text.includes('data-card-size>1000 px wide</span>'));
  assert.ok(text.includes('aria-valuenow="1000"'));
  assert.ok(!text.includes('width="390"'));
});

test('the current card has the width handle on its edge, and it is a slider for a keyboard', () => {
  const text = stage(input()).text;
  const handle = /<div class="card-handle"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(handle.includes('data-canvas="handle"'));
  assert.ok(handle.includes('role="slider"'));
  assert.ok(handle.includes('tabindex="0"'));
  assert.ok(handle.includes('aria-valuemin="320"'));
  assert.ok(handle.includes('aria-valuemax="2560"'));
  assert.ok(handle.includes('aria-valuenow="390"'));
  assert.ok(handle.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.handle'))}"`));
  // Inside the frame's box, after the frame: the frame itself is never moved.
  assert.ok(text.includes('></iframe><div class="card-handle"'));
});

test('compare shows two cards side by side in one world, the other version first', () => {
  const other = SRC.replace('v3', 'v1');
  const text = stage(input({ compare: { version: 1, built: true, src: other } })).text;
  assert.equal(count(text, 'data-canvas="world"'), 1);
  assert.equal(count(text, '<figure class="canvas-card'), 2);
  const before = text.indexOf('data-frame="before"');
  const current = text.indexOf('data-frame="current"');
  assert.ok(before > 0 && current > before);
  assert.ok(text.includes('<span class="card-name">Version 1</span>'));
  assert.ok(text.includes('<span class="card-name">Version 3</span>'));
  assert.ok(text.includes('title="Prototype of Shop, Version 1"'));
  assert.ok(text.includes('title="Prototype of Shop, Version 3"'));
  // One handle, on the current card; both cards get the same width.
  assert.equal(count(text, 'data-canvas="handle"'), 1);
  assert.equal(count(text, 'width="390"'), 2);
});

test('the two frames of a comparison talk on different channels', () => {
  const other = SRC.replace('v3', 'v1');
  const text = stage(input({ compare: { version: 1, built: true, src: other } })).text;
  const channels = [...text.matchAll(/data-channel="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(channels.length, 2);
  assert.notEqual(channels[0], channels[1]);
});

test('compare has the summary the script fills, outside the scroller', () => {
  const other = SRC.replace('v3', 'v1');
  const text = stage(input({ compare: { version: 1, built: true, src: other } })).text;
  assert.ok(text.includes('<p class="compare-summary" role="status" aria-live="polite"'));
  assert.ok(text.indexOf('compare-summary') > text.indexOf('data-canvas="shield"'));
});

test('a compared version that is not built says so in its card, without a summary', () => {
  const text = stage(input({ compare: { version: 1, built: false, src: SRC } })).text;
  assert.equal(count(text, '<iframe '), 1);
  assert.equal(count(text, '<figure class="canvas-card'), 2);
  assert.ok(text.includes(escapeHtml(t('studio.page.notBuilt', { version: 1, slug: 'shop' }))));
  assert.ok(!text.includes('compare-summary'));
});

test('the original of a rework stands beside the current card', () => {
  const original = html`<div class="pane"><p class="caption">Version 0, the original</p></div>`;
  const text = stage(input({ original })).text;
  assert.equal(count(text, 'data-canvas="world"'), 1);
  assert.ok(text.indexOf('Version 0, the original') < text.indexOf('data-card="current"'));
  assert.equal(count(text, '<iframe '), 1);
  assert.ok(text.includes('title="Prototype of Shop, Version 3"'));
});

test('a version that is not built has no canvas, only the way to build it', () => {
  const text = stage(input({ built: false })).text;
  assert.ok(!text.includes('data-canvas'));
  assert.ok(!text.includes('<iframe'));
  assert.ok(text.includes(escapeHtml(t('studio.page.notBuilt', { version: 3, slug: 'shop' }))));
});

test('names from files are escaped in the frame title', () => {
  const text = stage(input({ name: '"><script>alert(1)</script>' })).text;
  assert.ok(!text.includes('<script>'));
  assert.ok(text.includes('&lt;script&gt;'));
});

test('the dock has three parts: the width, the state and the empty zoom strip', () => {
  const text = docked();
  assert.ok(text.startsWith('<div class="editor-dock" data-shell="dock"'));
  const width = text.indexOf('data-dock="width"');
  const states = text.indexOf('data-dock="states"');
  const zoom = text.indexOf('data-dock="zoom"');
  assert.ok(width > 0 && states > width && zoom > states);
  assert.ok(text.includes('<div class="dock-part" data-dock="zoom"></div>'));
});

test('the width presets are links to the same view, the current one marked', () => {
  const text = docked({ ...CHOICE, width: 768 });
  for (const width of [390, 768, 1280]) {
    const href = escapeHtml(`/drafts/shop?version=3&state=filled&width=${width}`);
    const link = new RegExp(`<a class="opt" data-dock-width="${width}"[^>]*>${width}</a>`);
    const found = link.exec(text)?.[0] ?? '';
    assert.ok(found.includes(`href="${href}"`), String(width));
    assert.equal(found.includes('aria-current="true"'), width === 768, String(width));
  }
});

test('the number field takes any width from 320 to 2560 and works without the script', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const field = /<input type="number"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(field.includes('name="view"'));
  assert.ok(field.includes('data-dock-view'));
  assert.ok(field.includes('min="320"'));
  assert.ok(field.includes('max="2560"'));
  assert.ok(field.includes('step="1"'));
  assert.ok(field.includes('value="390"'));
  assert.ok(field.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.width'))}"`));
  // A plain GET form that names the rest of the view.
  assert.ok(text.includes('<form class="dock-field" data-dock="view" method="get" action="">'));
  assert.ok(text.includes('<input type="hidden" name="version" value="3">'));
  assert.ok(text.includes('<input type="hidden" name="state" value="filled">'));
  assert.ok(text.includes('<input type="hidden" name="width" value="390">'));
  assert.ok(text.includes('<input type="hidden" name="compare" value="1">'));
});

test('without a comparison the form names none', () => {
  assert.ok(!docked().includes('name="compare"'));
});

test('the state links carry their state id, the current one marked', () => {
  const text = docked({ ...CHOICE, state: 'empty' });
  const filled = /<a class="opt" data-state="filled"[^>]*>With data<\/a>/.exec(text)?.[0] ?? '';
  const empty = /<a class="opt" data-state="empty"[^>]*>Empty<\/a>/.exec(text)?.[0] ?? '';
  assert.ok(filled.includes(escapeHtml('/drafts/shop?version=3&state=filled&width=390')));
  assert.ok(!filled.includes('aria-current'));
  assert.ok(empty.includes('aria-current="true"'));
});

test('at a preset the note about hidden marks is there but hidden', () => {
  const text = docked();
  assert.match(text, /<p class="dock-note" data-dock-note role="status" hidden>/);
});

test('a width that is not a preset says that the marks are hidden at it', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const note = escapeHtml(t('studio.edit.canvas.marksHidden'));
  assert.ok(text.includes(`<p class="dock-note" data-dock-note role="status">${note}</p>`));
  // No preset is current, the field shows the width, and the checks stay on the preset.
  assert.ok(!/data-dock-width="[0-9]+"[^>]*aria-current/.test(text));
  assert.ok(/<input type="number"[^>]*value="1000"/.test(text));
  assert.ok(text.includes('<input type="hidden" name="width" value="390">'));
});

test('at a custom width the state links keep it and the preset links drop it', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const state = /<a class="opt" data-state="empty"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(state.includes(escapeHtml('state=empty&width=390&view=1000')));
  const preset = /<a class="opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768')));
  assert.ok(!preset.includes('view='));
});

test('a comparison stays on in the dock links', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const preset = /<a class="opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768&compare=1')));
});
