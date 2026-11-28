// The layer walk in a real browser, on test/fixtures/layers/page.html opened from disk as a draft's
// page is, at 390 x 844. The page has one of each case the walk meets (plan 21, Review Focus 4): a
// hidden element, one that is not visible, a box of zero, a CSS grid, a wrapper that paints nothing
// around a card, an absolutely placed badge, bold and a link inside a sentence, a gradient, a text
// of 5,000 characters, an image that did not load and one that did, a kit component that draws an
// icon and a label inside itself (no element id of their own), a field with a placeholder and a
// rule 1 px thick. With the state `crowd` its script puts 3,000 painted elements there instead.
// Fonts are system fonts, so no test holds a text to pixel counts. Skips without a browser.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import {
  LAYER_TEXT_MAX,
  LAYERS_NODE_CAP,
  type LayerFacts,
  type LayerNode,
} from '../../src/checks/domain/page/layers.ts';
import type { BrowserSession } from '../../src/checks/ports/browser.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { NO_BROWSER, openSession } from '../checks/adapters/site.ts';

const TEST_MS = 120_000;
const PAGE = join(PLUGIN_ROOT, 'test', 'fixtures', 'layers', 'page.html');
const STORY = 'sections/Story:main';
const BUTTON = `${STORY}/div.row/Button`;
const SENTENCE = 'Plans start at nine euros a month, and the terms are short.';
const INK = '#1a1a1aff';
const WHITE = '#ffffffff';

let session: BrowserSession | undefined;
let story: LayerFacts | undefined;

before(async () => {
  session = await openSession();
});

after(async () => {
  await session?.close();
});

/** The page walked in a state, or undefined without a browser. */
async function walk(state: string): Promise<LayerFacts | undefined> {
  if (session === undefined) return undefined;
  assert.ok(session.layers, 'the real browser walks layers');
  const report = await session.layers({ page: PAGE, state, width: 390, height: 844 });
  if (report.state === 'failed') assert.fail(`the walk failed: ${report.error}`);
  return report.facts;
}

/** The page in its own state, walked once for the tests that read it. */
async function storyFacts(): Promise<LayerFacts | undefined> {
  story ??= await walk('filled');
  return story;
}

/** The layer whose element id is its own, and its index. */
function own(facts: LayerFacts, ks: string): { index: number; node: LayerNode } {
  const index = facts.nodes.findIndex((node) => node.ownKs && node.ks === ks);
  const node = facts.nodes[index];
  assert.ok(node, `no layer of its own for ${ks}`);
  return { index, node };
}

/** The layers a layer holds. */
const childrenOf = (facts: LayerFacts, index: number): LayerNode[] =>
  facts.nodes.filter((node) => node.parent === index);

test('one layer per painted, placed or written thing, parents first', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(facts.viewport, [390, 844]);
  assert.equal(facts.background, '#fafafaff');
  assert.equal(facts.truncated, false);
  const kinds: Record<string, number> = {};
  for (const node of facts.nodes) kinds[node.kind] = (kinds[node.kind] ?? 0) + 1;
  assert.deepEqual(kinds, { frame: 13, text: 6, image: 1, svg: 1 });
  assert.equal(facts.nodes.length, 21);
  facts.nodes.forEach((node, index) => {
    assert.ok(node.parent >= -1 && node.parent < index, `layer ${index} comes after its parent`);
  });
  assert.deepEqual(
    facts.nodes.filter((node) => node.parent === -1).map((node) => node.ks),
    [STORY],
  );
});

test('hidden, invisible and empty boxes are no layers, nor is the wrapper around the card', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const ids = new Set(facts.nodes.map((node) => node.ks));
  for (const gone of ['p.hidden', 'p.unseen', 'div.zero']) {
    assert.equal(ids.has(`${STORY}/${gone}`), false, `${gone} is no layer`);
  }
  const main = own(facts, STORY);
  const card = own(facts, `${STORY}/section`);
  assert.equal(card.node.parent, main.index, 'the card takes the place of the wrapper');
  const strays = facts.nodes.filter((node) => node.tag === 'div' && !node.ownKs);
  assert.deepEqual(strays, []);
});

test('the sentence is one text layer, with runs for its bold part and its link', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const card = own(facts, `${STORY}/section`);
  const { node } = own(facts, `${STORY}/section/p`);
  assert.equal(node.kind, 'text');
  assert.equal(node.parent, card.index);
  assert.ok(node.text);
  assert.equal(node.text.characters, SENTENCE);
  assert.equal(node.text.truncated, false);
  assert.deepEqual(
    [node.text.weight, node.text.italic, node.text.size, node.text.lineHeight, node.text.colour],
    [400, false, 16, 24, INK],
  );
  const bold = SENTENCE.indexOf('nine euros');
  const link = SENTENCE.indexOf('the terms');
  assert.deepEqual(node.text.runs, [
    { start: bold, end: bold + 10, weight: 700, italic: false, underline: false, colour: INK },
    {
      start: link,
      end: link + 9,
      weight: 400,
      italic: false,
      underline: true,
      colour: '#2563ebff',
    },
  ]);
  assert.deepEqual([node.paints, node.border, node.flow], [[], null, null]);
});

test('the badge is placed apart and holds its label; the column and the grid', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const card = own(facts, `${STORY}/section`);
  const badge = own(facts, `${STORY}/section/span`);
  assert.equal(badge.node.kind, 'frame');
  assert.equal(badge.node.placed, 'absolute');
  assert.equal(badge.node.parent, card.index);
  assert.deepEqual(badge.node.fill, [false, false]);
  assert.deepEqual(badge.node.paints, [{ kind: 'solid', colour: '#dc2626ff' }]);
  const [label, ...more] = childrenOf(facts, badge.index);
  assert.deepEqual(more, []);
  assert.equal(label?.kind, 'text');
  assert.equal(label?.ownKs, false);
  assert.deepEqual([label?.text?.characters, label?.text?.colour], ['New', WHITE]);
  assert.equal(card.node.placed, 'flow');

  const main = own(facts, STORY).node;
  assert.deepEqual(main.flow, {
    direction: 'column',
    wrap: false,
    gap: 24,
    crossGap: 24,
    padding: [16, 16, 16, 16],
    justify: 'start',
    align: 'stretch',
  });
  const grid = own(facts, `${STORY}/div.grid`);
  assert.equal(grid.node.flow?.direction, 'none');
  assert.equal(childrenOf(facts, grid.index).length, 3);
});

test('paints: the gradient, the border, corners and shadow of the card, a rule 1 px thick', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  assert.deepEqual(own(facts, `${STORY}/div.gradient`).node.paints, [
    {
      kind: 'linear',
      angle: 90,
      stops: [
        { at: 0, colour: '#ff0000ff' },
        { at: 1, colour: '#0000ffff' },
      ],
    },
  ]);
  const card = own(facts, `${STORY}/section`).node;
  assert.deepEqual(card.paints, [{ kind: 'solid', colour: WHITE }]);
  assert.deepEqual(card.border, { widths: [1, 1, 1, 1], colour: '#d4d4d8ff' });
  assert.deepEqual(card.radius, [12, 12, 12, 12]);
  assert.deepEqual(card.shadows, [
    { x: 0, y: 1, blur: 2, spread: 0, colour: '#0000001a', inset: false },
  ]);
  const rule = own(facts, `${STORY}/div.rule`).node;
  assert.equal(rule.kind, 'frame');
  assert.equal(rule.box[3], 1);
  assert.deepEqual(rule.paints, [{ kind: 'solid', colour: '#d4d4d8ff' }]);
  assert.deepEqual(rule.fill, [false, true], 'it stretches across the column');
});

test('a text of 5,000 characters is cut at LAYER_TEXT_MAX and says so', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const { node } = own(facts, `${STORY}/p.long`);
  assert.equal(node.kind, 'text');
  assert.equal(node.text?.characters.length, LAYER_TEXT_MAX);
  assert.equal(node.text?.truncated, true);
});

test('a text that is all one inline element is drawn in its look, not the block around it', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const { node } = own(facts, `${STORY}/p.lone`);
  assert.equal(node.kind, 'text');
  assert.ok(node.text);
  assert.deepEqual(
    [node.text.characters, node.text.family, node.text.size, node.text.lineHeight],
    ['Help', 'monospace', 18, 28],
  );
  assert.equal(node.text.colour, '#2563ebff');
  assert.deepEqual(node.text.runs, []);
  assert.equal(node.box[3], 28);
});

test('an image that did not load is a frame of its size; one that did is an image', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const missing = own(facts, `${STORY}/img.missing`).node;
  assert.deepEqual([missing.kind, missing.tag, missing.paints], ['frame', 'img', []]);
  assert.deepEqual(missing.box.slice(2), [120, 80]);
  const shown = own(facts, `${STORY}/img.loaded`).node;
  assert.equal(shown.kind, 'image');
  const [paint] = shown.paints;
  assert.equal(paint?.kind, 'image');
  assert.ok(paint?.kind === 'image' && paint.src.startsWith('data:image/svg+xml'));
  assert.equal(paint.fit, 'fill');
  assert.equal(shown.clips, true);
});

test('what a kit component draws inside itself: the icon as an svg, the label as text', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const button = own(facts, BUTTON);
  assert.equal(button.node.kind, 'frame');
  assert.equal(button.node.flow?.direction, 'row');
  assert.equal(button.node.flow?.gap, 8);
  const [icon, label, ...more] = childrenOf(facts, button.index);
  assert.deepEqual(more, []);
  assert.deepEqual([icon?.kind, icon?.ks, icon?.ownKs], ['svg', BUTTON, false]);
  const svg = icon?.svg ?? '';
  assert.match(svg, /^<svg /);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /stroke="#ffffff"/);
  assert.match(svg, /stroke-width="2"/);
  assert.match(svg, /fill="none"/);
  assert.doesNotMatch(svg, /currentColor|aria-|data-/i);
  assert.deepEqual([label?.kind, label?.ks, label?.ownKs], ['text', BUTTON, false]);
  assert.deepEqual([label?.text?.characters, label?.text?.colour], ['Save', WHITE]);
});

test('a field shows its placeholder as a text layer inside it', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await storyFacts();
  if (facts === undefined) return t.skip(NO_BROWSER);
  const field = own(facts, `${STORY}/input`);
  assert.equal(field.node.kind, 'frame');
  const [hint, ...more] = childrenOf(facts, field.index);
  assert.deepEqual(more, []);
  assert.deepEqual([hint?.kind, hint?.text?.characters], ['text', 'Email']);
});

test('at 3,000 elements the walk stops at LAYERS_NODE_CAP and says it was cut', {
  timeout: TEST_MS,
}, async (t) => {
  const facts = await walk('crowd');
  if (facts === undefined) return t.skip(NO_BROWSER);
  assert.equal(facts.truncated, true);
  assert.equal(facts.nodes.length, LAYERS_NODE_CAP);
  assert.deepEqual(
    facts.nodes.slice(0, 2).map((node) => node.ks),
    [STORY, 'sections/Crowd:div'],
  );
  assert.ok(facts.nodes.every((node, index) => node.parent < index));
});
