import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft, States } from '../../../../src/drafts/index.ts';
import { choiceLink } from '../../../../src/studio/pages/draft/draft-links.ts';
import {
  cardSize,
  pills,
  type StageInput,
  stage,
} from '../../../../src/studio/pages/draft/draft-stage.ts';
import { escapeHtml, html } from '../../../../src/studio/pages/html.ts';
import type { DraftChoice } from '../../../../src/studio/views/draft-query.ts';
import { t } from '../../../helpers/translate.ts';

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

const count = (text: string, part: string): number => text.split(part).length - 1;

const CHOICE: DraftChoice = { version: 3, state: 'filled', width: 390 };
const docked = (choice: DraftChoice = CHOICE): string =>
  pills({ t, choice, states: STATES, link: choiceLink(DRAFT, choice) }).text;

/** One pill of the row, by its `data-dock`. */
const pill = (text: string, part: string): string =>
  new RegExp(`<(div|nav) class="k-pop k-pill" data-dock="${part}"[^>]*>(.*?)</\\1>`).exec(
    text,
  )?.[0] ?? '';

test('one version shows as one card in the canvas, with the scroller, sizer, world and shield', () => {
  const text = stage(input()).text;
  assert.ok(text.startsWith('<div class="stage-scroll" data-canvas="scroll">'));
  assert.ok(text.includes('<div class="stage-sizer" data-canvas="sizer">'));
  assert.ok(text.includes('<div class="stage-world" data-canvas="world">'));
  assert.ok(text.includes('<div class="stage-shield" data-canvas="shield" hidden></div>'));
  assert.equal(count(text, '<figure class="card-box"'), 1);
  assert.equal(count(text, '<iframe '), 1);
  assert.ok(text.includes('data-card="current"'));
  assert.ok(text.includes('data-frame="current"'));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(!text.includes('data-compare-summary'));
});

test('the shield lies over the world, inside the sizer, so it takes a drag over any card', () => {
  const text = stage(input()).text;
  const world = text.indexOf('data-canvas="world"');
  const shield = text.indexOf('data-canvas="shield"');
  assert.ok(world > 0 && shield > world);
  assert.ok(text.endsWith('data-canvas="shield" hidden></div></div></div>'));
  // The Versions list lives in the Layers pane now, never on the canvas.
  assert.ok(!text.includes('data-timeline'));
});

test('the label above the card names the draft, then the width it shows', () => {
  const text = stage(input()).text;
  const caption = /<figcaption class="card-caption">(.*?)<\/figcaption>/.exec(text)?.[1] ?? '';
  const size = escapeHtml(cardSize(t, 390));
  assert.equal(
    caption,
    `<span class="card-name">Shop</span><span class="card-size" data-card-size>${size}</span>`,
  );
  // Above: the label comes before the frame.
  assert.ok(text.indexOf('<figcaption') < text.indexOf('<iframe'));
});

test('a card label names a preset by its name and width, any other width in pixels', () => {
  const desktop = cardSize(t, 1280);
  assert.equal(
    desktop,
    t('studio.edit.canvas.size.preset', { name: t('studio.width.1280'), width: 1280 }),
  );
  assert.ok(desktop.includes(t('studio.width.1280')) && desktop.includes('1280'));
  assert.equal(cardSize(t, 1000), t('studio.edit.canvas.size.custom', { width: 1000 }));
  assert.ok(!cardSize(t, 1000).includes(t('studio.width.1280')));
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
  // The frame sits in its box, and nothing in the markup styles it.
  assert.ok(text.includes('<div class="card-frame"><iframe '));
  assert.ok(!text.includes('style='));
});

test('a custom width shows in the card instead of the preset', () => {
  const text = stage(input({ width: 390, view: 1000 })).text;
  assert.ok(text.includes('width="1000"'));
  assert.ok(text.includes(`data-card-size>${escapeHtml(cardSize(t, 1000))}</span>`));
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

test('compare shows two labelled cards side by side in one world, the other version first', () => {
  const other = SRC.replace('v3', 'v1');
  const text = stage(input({ compare: { version: 1, built: true, src: other } })).text;
  assert.equal(count(text, 'data-canvas="world"'), 1);
  assert.equal(count(text, '<figure class="card-box"'), 2);
  const before = text.indexOf('data-frame="before"');
  const current = text.indexOf('data-frame="current"');
  assert.ok(before > 0 && current > before);
  // Beside each other, the cards are told apart by their versions.
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

test('compare has the summary the script fills, floating outside the scroller', () => {
  const other = SRC.replace('v3', 'v1');
  const text = stage(input({ compare: { version: 1, built: true, src: other } })).text;
  assert.ok(
    text.includes(
      '<p class="k-pop cmp-summary" data-compare-summary role="status" aria-live="polite"',
    ),
  );
  assert.ok(text.indexOf('data-compare-summary') > text.indexOf('data-canvas="shield"'));
  for (const key of ['changed', 'added', 'removed', 'same']) {
    assert.ok(text.includes(`data-${key}="${escapeHtml(t(`studio.compare.${key}`))}"`), key);
  }
});

test('a compared version that is not built says so in its card, with the command to build it', () => {
  const text = stage(input({ compare: { version: 1, built: false, src: SRC } })).text;
  assert.equal(count(text, '<iframe '), 1);
  assert.equal(count(text, '<figure class="card-box"'), 2);
  assert.ok(text.includes('<div class="k-empty cmp-empty">'));
  assert.ok(text.includes(escapeHtml(t('studio.draft.notBuilt', { version: 1 }))));
  assert.ok(text.includes('<div class="k-cmd"><code>kitvas build shop</code>'));
  assert.ok(!text.includes('data-compare-summary'));
});

test('the original of a rework stands beside the current card', () => {
  const original = html`<figure class="card-box cmp-card" data-card="original"></figure>`;
  const text = stage(input({ original })).text;
  assert.equal(count(text, 'data-canvas="world"'), 1);
  assert.ok(text.indexOf('data-card="original"') < text.indexOf('data-card="current"'));
  assert.equal(count(text, '<iframe '), 1);
  assert.ok(text.includes('title="Prototype of Shop, Version 3"'));
  assert.ok(text.includes('<span class="card-name">Version 3</span>'));
  assert.ok(!text.includes('data-compare-summary'));
});

test('a version that is not built has no canvas: one sentence and the command that builds it', () => {
  const text = stage(input({ built: false })).text;
  assert.ok(!text.includes('data-canvas'));
  assert.ok(!text.includes('<iframe'));
  assert.ok(text.startsWith('<div class="k-empty stage-empty">'));
  assert.ok(text.includes(`<p>${escapeHtml(t('studio.draft.notBuilt', { version: 3 }))}</p>`));
  assert.ok(text.includes('<div class="k-cmd"><code>kitvas build shop</code>'));
  assert.ok(text.includes('data-copy'));
});

test('names from files are escaped in the frame title and the label', () => {
  const text = stage(input({ name: '"><script>alert(1)</script>' })).text;
  assert.ok(!text.includes('<script>'));
  assert.ok(text.includes('&lt;script&gt;'));
});

test('the pills: width, cards and state at the top right, and the empty zoom pill apart', () => {
  const text = docked();
  assert.ok(text.startsWith('<div class="pill-row" data-shell="dock" role="group"'));
  assert.ok(text.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.controls'))}"`));
  const width = text.indexOf('data-dock="width"');
  const cards = text.indexOf('data-dock="cards"');
  const states = text.indexOf('data-dock="states"');
  const zoom = text.indexOf('data-dock="zoom"');
  assert.ok(width > 0 && cards > width && states > cards && zoom > states);
  assert.ok(text.includes('<div class="k-pop k-pill" data-dock="width">'));
  assert.ok(text.includes('<nav class="k-pop k-pill" data-dock="states"'));
  // The zoom pill is outside the row: it sits at the bottom right, filled by the script.
  assert.ok(
    text.endsWith(
      `<div class="k-pop k-pill pill-zoom" data-dock="zoom" role="group" aria-label="${escapeHtml(t('studio.edit.zoom.label'))}"></div>`,
    ),
  );
  assert.ok(!text.includes('class="opt"'));
});

test('the width presets are links to the same view, the current one marked', () => {
  const text = docked({ ...CHOICE, width: 768 });
  assert.ok(text.includes('<nav class="pill-group" data-dock="widths"'));
  for (const width of [390, 768, 1280]) {
    const href = escapeHtml(`/drafts/shop?version=3&state=filled&width=${width}`);
    const link = new RegExp(
      `<a class="k-btn pill-opt" data-dock-width="${width}"[^>]*>${width}</a>`,
    );
    const found = link.exec(text)?.[0] ?? '';
    assert.ok(found.includes(`href="${href}"`), String(width));
    assert.ok(found.includes(`title="${escapeHtml(t(`studio.width.${width}`))}"`), String(width));
    assert.equal(found.includes('aria-current="true"'), width === 768, String(width));
  }
});

test('the number field takes any width from 320 to 2560 and works without the script', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const field = /<input class="k-field pill-number" type="number"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(field.includes('name="view"'));
  assert.ok(field.includes('data-dock-view'));
  assert.ok(field.includes('min="320"'));
  assert.ok(field.includes('max="2560"'));
  assert.ok(field.includes('step="1"'));
  assert.ok(field.includes('value="390"'));
  assert.ok(field.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.width'))}"`));
  // A plain GET form that names the rest of the view, in the width pill.
  assert.ok(text.includes('<form class="pill-field" data-dock="view" method="get" action="">'));
  assert.ok(text.indexOf('data-dock="view"') > text.indexOf('data-dock="widths"'));
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
  const filled =
    /<a class="k-btn pill-opt" data-state="filled"[^>]*>With data<\/a>/.exec(text)?.[0] ?? '';
  const empty =
    /<a class="k-btn pill-opt" data-state="empty"[^>]*>Empty<\/a>/.exec(text)?.[0] ?? '';
  assert.ok(filled.includes(escapeHtml('/drafts/shop?version=3&state=filled&width=390')));
  assert.ok(!filled.includes('aria-current'));
  assert.ok(empty.includes('aria-current="true"'));
});

test('at a preset the mark of hidden marks is there but hidden, and says nothing', () => {
  const text = docked();
  assert.match(
    text,
    /<button type="button" class="k-icon-btn pill-mark" data-dock-note[^>]* hidden>/,
  );
  assert.ok(text.includes('<span class="k-sr" role="status" data-dock-said></span>'));
});

test('a width that is not a preset says that the marks are hidden at it', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const note = escapeHtml(t('studio.edit.canvas.marksHidden'));
  // A mark at the end of the width pill, never a block over the canvas: its words are its name
  // and its title, and a status for a screen reader.
  assert.ok(
    text.includes(
      `<button type="button" class="k-icon-btn pill-mark" data-dock-note aria-label="${note}" title="${note}">`,
    ),
  );
  assert.ok(text.includes(`<span class="k-sr" role="status" data-dock-said>${note}</span></div>`));
  assert.ok(!text.includes('pill-note'));
  // No preset is current, the field shows the width, and the checks stay on the preset.
  assert.ok(!/data-dock-width="[0-9]+"[^>]*aria-current/.test(text));
  assert.ok(/<input class="k-field pill-number" type="number"[^>]*value="1000"/.test(text));
  assert.ok(text.includes('<input type="hidden" name="width" value="390">'));
});

test('at a custom width the state links keep it and the preset links drop it', () => {
  const text = docked({ ...CHOICE, view: 1000 });
  const state = /<a class="k-btn pill-opt" data-state="empty"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(state.includes(escapeHtml('state=empty&width=390&view=1000')));
  const preset = /<a class="k-btn pill-opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768')));
  assert.ok(!preset.includes('view='));
});

test('three cards: the width shown first, then one card per other preset', () => {
  const text = stage(input({ width: 768, cards: 3 })).text;
  assert.equal(count(text, '<figure class="card-box"'), 3);
  assert.equal(count(text, '<iframe '), 3);
  assert.equal(count(text, 'data-frame="current"'), 1);
  assert.equal(count(text, 'data-frame="width"'), 2);
  assert.ok(text.indexOf('data-card="current"') < text.indexOf('data-card="width"'));
  assert.ok(text.includes('data-card="width" data-card-width="390"'));
  assert.ok(text.includes('data-card="width" data-card-width="1280"'));
  assert.ok(!text.includes('data-card-width="768"'));
  const channels = [...text.matchAll(/data-channel="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(channels).size, 3, 'every card talks on a channel of its own');
  // One handle: the width cards keep their preset, and their label says which.
  assert.equal(count(text, 'data-canvas="handle"'), 1);
  assert.ok(text.includes('title="Prototype of Shop, 390 px wide"'));
  assert.ok(text.includes(`data-card-size>${escapeHtml(cardSize(t, 1280))}</span>`));
  assert.equal(count(text, '<span class="card-name">Shop</span>'), 3);
});

test('two cards add the next preset; one card and compare add none', () => {
  const two = stage(input({ width: 390, cards: 2 })).text;
  assert.equal(count(two, 'data-frame="width"'), 1);
  assert.ok(two.includes('data-card-width="768"'));
  assert.equal(count(stage(input({ cards: 1 })).text, '<iframe '), 1);
  const other = SRC.replace('v3', 'v1');
  const compared = stage(input({ cards: 3, compare: { version: 1, built: true, src: other } }));
  assert.ok(!compared.text.includes('data-frame="width"'));
});

test('the cards pill links to one, two and three cards, the shown count marked', () => {
  const text = docked({ ...CHOICE, cards: 2 });
  const part = pill(text, 'cards');
  assert.ok(part, 'the pill is there');
  assert.ok(part.includes(`aria-label="${escapeHtml(t('studio.edit.canvas.cards'))}"`));
  const links = [...part.matchAll(/<a class="k-btn pill-opt" data-dock-cards="(\d)"[^>]*>/g)];
  assert.deepEqual(
    links.map((link) => link[1]),
    ['1', '2', '3'],
  );
  const two = links.find((link) => link[1] === '2')?.[0] ?? '';
  assert.ok(two.includes('aria-current="true"'));
  assert.ok(two.includes(escapeHtml('width=390&cards=2')));
  const one = links.find((link) => link[1] === '1')?.[0] ?? '';
  assert.ok(!one.includes('&amp;cards='));
  // "Every width" needs the script, which shows it.
  assert.match(part, /<button type="button" class="k-btn pill-opt" data-dock-every [^>]*hidden>/);
});

test('the pills keep the cards, and the number field names them', () => {
  const text = docked({ ...CHOICE, cards: 3 });
  const state = /<a class="k-btn pill-opt" data-state="empty"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(state.includes(escapeHtml('state=empty&width=390&cards=3')));
  const preset = /<a class="k-btn pill-opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768&cards=3')));
  assert.ok(text.includes('<input type="hidden" name="cards" value="3">'));
  assert.ok(!docked().includes('name="cards"'));
});

test('while comparing the cards pill is off, with the reason', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const part = /<div class="k-pop k-pill" data-dock="cards"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(part.includes('data-off'));
  assert.ok(part.includes(`title="${escapeHtml(t('studio.edit.canvas.cardsOff'))}"`));
  assert.ok(!text.includes('data-dock-cards'));
  assert.ok(!text.includes('data-dock-every'));
  assert.equal(count(text, 'aria-disabled="true"'), 3);
});

test('a comparison stays on in the pills links', () => {
  const text = docked({ ...CHOICE, compare: 1 });
  const preset = /<a class="k-btn pill-opt" data-dock-width="768"[^>]*>/.exec(text)?.[0] ?? '';
  assert.ok(preset.includes(escapeHtml('width=768&compare=1')));
});
