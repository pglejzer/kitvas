import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cardSize,
  type StageInput,
  stage,
} from '../../../../src/studio/pages/draft/draft-stage.ts';
import { escapeHtml, html } from '../../../../src/studio/pages/html.ts';
import { t } from '../../../helpers/translate.ts';

// The pills over the canvas have their own tests: `draft-pills.test.ts`.

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
  // The height of a tablet screen comes with the page, so the canvas fits the card only once.
  assert.ok(frame.includes('width="768" height="1024"'));
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
  assert.ok(text.includes('width="1000" height="1024"'));
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
  // Each card's frame has the height of its screen from the start: a phone, a desktop window.
  assert.ok(text.includes('width="390" height="844"'));
  assert.ok(text.includes('width="1280" height="800"'));
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
