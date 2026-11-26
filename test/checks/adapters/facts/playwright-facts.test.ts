// The facts walk in a real browser, on the pages in test/fixtures/checks/ (read its README), opened
// from disk as a draft's page is. Skips when this machine has no browser.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { FactNode, PageFacts } from '../../../../src/checks/domain/page/facts.ts';
import type { PageReport } from '../../../../src/checks/domain/page/page.ts';
import type { BrowserSession, Pass } from '../../../../src/checks/ports/browser.ts';
import { PLUGIN_ROOT } from '../../../../src/shared/index.ts';
import { NO_BROWSER, openSession } from '../site.ts';

const TEST_MS = 120_000;
const PAGES = join(PLUGIN_ROOT, 'test', 'fixtures', 'checks');
/** The paragraph of text.html, as written there. */
const PARAGRAPH =
  'Kitvas measures each paragraph by its line boxes, so the widest line of a text block is counted the way a reader sees it on screen.';

let session: BrowserSession | undefined;

before(async () => {
  session = await openSession();
});

after(async () => {
  await session?.close();
});

/** One visit of a fixture page at 390 × 844 with no screenshot, or undefined without a browser. */
async function visit(file: string, passes: Pass[] = []): Promise<PageReport | undefined> {
  if (session === undefined) return undefined;
  return session.visit({
    page: join(PAGES, file),
    state: 'filled',
    width: 390,
    height: 844,
    screenshot: null,
    passes,
    options: {},
  });
}

function factsOf(report: PageReport): PageFacts {
  assert.ok(report.facts, `no facts: ${JSON.stringify(report.pageErrors)}`);
  return report.facts;
}

/** The node with this id attribute, and its index. */
function find(facts: PageFacts, id: string): { index: number; node: FactNode } {
  const index = facts.nodes.findIndex((node) => node.domId === id);
  const node = facts.nodes[index];
  assert.ok(node, `no node #${id}`);
  return { index, node };
}

test('a paragraph of three lines: its widest line within a character of a per-character count', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('text.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.equal(report.shot, false);
  assert.deepEqual(facts.viewport, [390, 844]);
  assert.equal(facts.bodyFontSize, 16);
  assert.equal(facts.truncated, false);
  // No pass was asked for.
  assert.deepEqual([facts.focus, facts.reflow, facts.spacing], [[], null, null]);

  const para = find(facts, 'para').node;
  const [lines = 0, widest = 0] = (find(facts, 'truth').node.text?.sample ?? '')
    .split(' ')
    .map(Number);
  assert.ok(para.text, 'the paragraph is a text block');
  assert.ok(lines >= 3, `counted lines: ${lines}`);
  assert.equal(para.text.lines, lines);
  assert.ok(
    Math.abs(para.text.longest - widest) <= 1,
    `longest ${para.text.longest}, counted ${widest}`,
  );
  assert.equal(para.text.chars, PARAGRAPH.length);
  assert.equal(para.text.sample, PARAGRAPH.slice(0, 80));

  const article = find(facts, 'para').node.parent;
  assert.equal(facts.nodes[article]?.tag, 'article');
  // A block that holds blocks is no text block.
  assert.equal(facts.nodes[article]?.text, null);
  assert.equal(facts.nodes[article]?.parent, -1);
  assert.equal(para.ks, 'sections/Story:article/p');
  assert.equal(para.ownKs, true);
  assert.equal(para.hidden, false);
  assert.equal(para.heading, 0);
  assert.deepEqual(
    [para.style.fontSize, para.style.lineHeight, para.style.fontWeight, para.style.color],
    [16, 24, 400, '#1a1a1aff'],
  );
  assert.deepEqual([para.style.background, para.style.ground], ['#00000000', '#ffffffff']);
  assert.deepEqual(para.box, [16, 16, 320, para.box[3]]);
  assert.equal(para.box[3], lines * 24);
});

test('fields are named by what shows: a visible label, a hidden one, aria, a placeholder, none', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('labels.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  const field = (id: string) => {
    const found = find(facts, id).node.field;
    assert.ok(found, `#${id} is a field`);
    return found;
  };
  const form = find(facts, 'form').index;

  const name = field('name');
  assert.deepEqual(
    [name.control, name.type, name.label, name.labelText, name.mark, name.required],
    ['input', 'text', 'visible', 'Full name *', 'required', true],
  );
  assert.deepEqual(name.labelBox, find(facts, 'name-label').node.box);
  assert.deepEqual(
    [name.autocomplete, name.form, name.group, name.groupName],
    ['name', form, -1, ''],
  );
  assert.equal(find(facts, 'name').node.landmark, 'form');

  const search = field('search');
  assert.deepEqual(
    [search.type, search.label, search.labelText, search.labelBox],
    ['search', 'hidden', 'Search the shop', null],
  );
  assert.deepEqual([field('code').label, field('code').labelText], ['aria', 'Discount code']);
  assert.deepEqual(
    [field('city').label, field('city').labelText, field('city').placeholder],
    ['placeholder', 'City', 'City'],
  );
  assert.deepEqual([field('bare').label, field('bare').labelText], ['none', '']);

  const plan = find(facts, 'plan').index;
  const basic = field('basic');
  const pro = field('pro');
  assert.deepEqual(
    [basic.type, basic.value, basic.label, basic.labelText, basic.group, basic.groupName],
    ['radio', 'basic', 'visible', 'Basic', plan, 'Plan'],
  );
  assert.deepEqual([pro.value, pro.labelText, pro.mark], ['', 'Pro (optional)', 'optional']);

  const email = field('email');
  assert.deepEqual([email.invalid, email.value], [true, 'sam@']);
  assert.deepEqual(email.described, [
    {
      text: 'Enter an email address like name@example.com',
      box: find(facts, 'email-error').node.box,
      errorMessage: false,
    },
  ]);
  assert.deepEqual([field('secret').type, field('secret').value], ['password', '']);
});

test('the visually hidden pattern and clip-path to nothing are hidden; shown text is not', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('labels.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  const hidden = (id: string) => find(facts, id).node.hidden;
  assert.deepEqual(['visually', 'inset', 'search-label', 'shown', 'name'].map(hidden), [
    true,
    true,
    true,
    false,
    false,
  ]);
});

test('actions carry their name, visible text and href; images their natural size', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('labels.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  assert.deepEqual(find(facts, 'more').node.action, {
    kind: 'link',
    name: 'See all plans',
    text: 'See all plans',
    href: '/plans',
    submit: false,
    disabled: false,
    menu: false,
    current: null,
    lines: 1,
  });
  assert.deepEqual(find(facts, 'close').node.action, {
    kind: 'button',
    name: 'Close',
    text: '',
    href: null,
    submit: false,
    disabled: false,
    menu: false,
    current: null,
    lines: 1,
  });
  const save = find(facts, 'save').node.action;
  assert.deepEqual([save?.kind, save?.name, save?.submit], ['button', 'Save', true]);
  // A field is no action, and a link is no field.
  assert.equal(find(facts, 'name').node.action, null);
  assert.equal(find(facts, 'more').node.field, null);

  assert.deepEqual(find(facts, 'photo').node.image, {
    natural: [4, 2],
    sized: true,
    alt: 'A dot',
    // The fixture's photo is an SVG data URL: a drawing, never "upscaled".
    vector: true,
  });
  const path = facts.nodes.find((node) => node.tag === 'path');
  assert.deepEqual([path?.style.stroke, path?.style.fill], ['#1a1a1aff', '#000000ff']);
  // Fill and stroke belong to SVG elements only.
  assert.equal(find(facts, 'close').node.style.fill, '');
});

test('an action counts the lines its visible label takes', { timeout: TEST_MS }, async (t) => {
  const report = await visit('wrapped-action.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  const lines = (id: string) => find(facts, id).node.action?.lines;
  assert.ok((lines('narrow') ?? 0) >= 2, 'a narrow button wraps its label');
  assert.equal(lines('fits'), 1);
  assert.equal(lines('icon'), 1);
  assert.equal(lines('field-button'), 1);
  assert.ok((lines('link') ?? 0) >= 2, 'a block link that wraps counts its lines too');
});

test('a sticky header is a bar at the top one viewport down the page', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('sticky.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  const bar = find(facts, 'bar');
  assert.deepEqual(facts.fixed, [{ node: bar.index, edge: 'top', height: 80 }]);
  assert.equal(bar.node.style.position, 'sticky');
  assert.equal(bar.node.landmark, 'banner');
  // The page was scrolled back before the walk's boxes were read by anything else.
  assert.equal(bar.node.box[1], 0);
});

test('text over a gradient is a node axe could not decide; plain text is not', {
  timeout: TEST_MS,
}, async (t) => {
  const report = await visit('unsure.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  const facts = factsOf(report);
  const over = find(facts, 'over');
  assert.deepEqual(report.contrastUnsure, [
    { node: over.index, element: 'sections/Hero:section/p' },
  ]);
  assert.equal(facts.nodes[over.node.parent]?.style.backgroundImage, true);
  assert.equal(over.node.style.color, '#ffffffff');
});

test('a page that does not load has no facts', { timeout: TEST_MS }, async (t) => {
  const report = await visit('missing.html');
  if (report === undefined) return t.skip(NO_BROWSER);
  assert.equal(report.facts, null);
  assert.equal(report.rendered, false);
});
