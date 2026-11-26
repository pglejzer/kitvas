import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLayout } from '../../../src/drafts/domain/layout.ts';
import {
  insertSectionBlock,
  moveSectionBlock,
  removeSectionBlock,
  renameSectionBlock,
  sectionBlock,
} from '../../../src/drafts/domain/layout-edit.ts';
import { layoutTemplate } from '../../../src/drafts/domain/templates.ts';

/** The title, a comment holding a heading, and the shared block: what comes before the sections. */
const HEAD = [
  '# Layout: Shop',
  '',
  '<!--',
  '## not-a-section',
  '-->',
  '',
  '## shared',
  'Page width: 1200px.',
  '',
];
const HERO = ['## hero', 'Purpose: Say what the shop sells.', 'Components: Button'];
const PLANS = ['## plans', 'Purpose: Compare the plans.', 'Components: Card, Button'];
const FOOTER = ['## footer', 'Purpose: Links.', 'Components: Button'];
const FAQ = ['## faq', 'Purpose: Answer questions.', 'Components: Text'];

/** The head, then the blocks with one blank line between them, and a final line ending. */
const layout = (...blocks: string[][]): string =>
  [...HEAD, ...blocks.flatMap((block) => [...block, ''])].join('\n');

const LAYOUT = layout(HERO, PLANS, FOOTER);
const CRLF = LAYOUT.replaceAll('\n', '\r\n');

const ids = (text: string): string[] => parseLayout(text).sections.map((section) => section.id);

function must(text: string | null): string {
  assert.ok(text !== null);
  return text;
}

test('a block runs from its heading to the next heading, as parseLayout sees them', () => {
  assert.equal(sectionBlock(LAYOUT, 'plans'), `${PLANS.join('\n')}\n`);
  assert.equal(sectionBlock(LAYOUT, 'footer'), `${FOOTER.join('\n')}\n`);
  // Without a final line ending, the last block has none either.
  assert.equal(sectionBlock(LAYOUT.trimEnd(), 'footer'), FOOTER.join('\n'));
  assert.equal(sectionBlock(LAYOUT, 'shared'), null);
  assert.equal(sectionBlock(LAYOUT, 'not-a-section'), null);
  assert.equal(sectionBlock(LAYOUT, 'nope'), null);
  // A `###` line stays inside the block; a `#` heading ends it.
  const nested = ['## hero', 'Purpose: a', '### notes', 'x', '# Appendix', '## plans'].join('\n');
  assert.equal(sectionBlock(nested, 'hero'), '## hero\nPurpose: a\n### notes\nx\n');
});

test('moving the first section last and back gives the layout byte for byte', () => {
  const moved = must(moveSectionBlock(LAYOUT, 'hero', 'footer'));
  assert.equal(moved, layout(PLANS, FOOTER, HERO));
  assert.deepEqual(ids(moved), ['plans', 'footer', 'hero']);
  assert.equal(moveSectionBlock(moved, 'hero', null), LAYOUT);

  const there = must(moveSectionBlock(CRLF, 'hero', 'footer'));
  assert.equal(there, layout(PLANS, FOOTER, HERO).replaceAll('\n', '\r\n'));
  assert.equal(moveSectionBlock(there, 'hero', null), CRLF);
});

test('only the blocks move: the text before the first section and the shared block stay', () => {
  const moved = must(moveSectionBlock(LAYOUT, 'footer', 'hero'));
  assert.equal(moved, layout(HERO, FOOTER, PLANS));
  assert.ok(moved.startsWith(`${HEAD.join('\n')}\n## hero`));
  assert.equal(parseLayout(moved).shared, 'Page width: 1200px.');

  // A shared block between two sections is no section: it stays where it is.
  const shared = ['## shared', 'Width: 1200px.'];
  const between = ['# Layout: Shop', '', ...HERO, '', ...shared, '', ...PLANS, ''].join('\n');
  assert.equal(
    moveSectionBlock(between, 'plans', null),
    ['# Layout: Shop', '', ...PLANS, '', ...HERO, '', ...shared, ''].join('\n'),
  );

  // A file without a final line ending keeps it so.
  assert.equal(
    moveSectionBlock(LAYOUT.trimEnd(), 'footer', 'hero'),
    layout(HERO, FOOTER, PLANS).trimEnd(),
  );
});

test('a move to where the section already is changes nothing, and an unknown one is null', () => {
  assert.equal(moveSectionBlock(LAYOUT, 'plans', 'hero'), LAYOUT);
  assert.equal(moveSectionBlock(LAYOUT, 'hero', null), LAYOUT);
  assert.equal(moveSectionBlock(LAYOUT, 'hero', 'hero'), LAYOUT);
  assert.equal(moveSectionBlock(LAYOUT, 'nope', null), null);
  assert.equal(moveSectionBlock(LAYOUT, 'hero', 'nope'), null);
  assert.equal(moveSectionBlock(LAYOUT, 'shared', null), null);
});

test('an inserted block gets one blank line before it, in the layout line endings', () => {
  assert.equal(
    insertSectionBlock(LAYOUT, `${FAQ.join('\r\n')}\r\n`, 'hero'),
    layout(HERO, FAQ, PLANS, FOOTER),
  );
  assert.equal(insertSectionBlock(LAYOUT, FAQ.join('\n'), null), layout(FAQ, HERO, PLANS, FOOTER));
  assert.equal(
    insertSectionBlock(LAYOUT, FAQ.join('\n'), 'footer'),
    layout(HERO, PLANS, FOOTER, FAQ),
  );
  const crlf = must(insertSectionBlock(CRLF, FAQ.join('\n'), 'footer'));
  assert.equal(crlf, layout(HERO, PLANS, FOOTER, FAQ).replaceAll('\n', '\r\n'));
  assert.doesNotMatch(crlf, /[^\r]\n/);
});

test('the first section of a new layout goes after its shared block', () => {
  const scaffold = layoutTemplate('Shop');
  const inserted = must(insertSectionBlock(scaffold, FAQ.join('\n'), null));
  assert.equal(inserted, `${scaffold}\n${FAQ.join('\n')}\n`);
  assert.deepEqual(ids(inserted), ['faq']);
  assert.equal(parseLayout(inserted).shared, parseLayout(scaffold).shared);
});

test('a block is inserted only after a known section, as one new section', () => {
  assert.equal(insertSectionBlock(LAYOUT, FAQ.join('\n'), 'nope'), null);
  // The layout has that id already.
  assert.equal(insertSectionBlock(LAYOUT, HERO.join('\n'), null), null);
  const two = [...FAQ, '## more', 'Purpose: x'].join('\n');
  assert.equal(insertSectionBlock(LAYOUT, two, null), null);
  assert.equal(insertSectionBlock(LAYOUT, '## shared\nWidth: 900px.\n', null), null);
  assert.equal(insertSectionBlock(LAYOUT, `Intro\n${FAQ.join('\n')}`, null), null);
});

test('a removed block takes its blank line along, and the layout ends as it did', () => {
  assert.equal(removeSectionBlock(LAYOUT, 'plans'), layout(HERO, FOOTER));
  assert.equal(removeSectionBlock(LAYOUT, 'footer'), layout(HERO, PLANS));
  assert.equal(removeSectionBlock(LAYOUT.trimEnd(), 'footer'), layout(HERO, PLANS).trimEnd());
  assert.equal(removeSectionBlock(LAYOUT, 'nope'), null);
  assert.equal(removeSectionBlock(LAYOUT, 'shared'), null);
});

test('a block removed and inserted back at its place gives the layout byte for byte', () => {
  const places: [string, string | null][] = [
    ['hero', null],
    ['plans', 'hero'],
    ['footer', 'plans'],
  ];
  for (const text of [LAYOUT, CRLF]) {
    for (const [id, after] of places) {
      const block = must(sectionBlock(text, id));
      const removed = must(removeSectionBlock(text, id));
      assert.equal(insertSectionBlock(removed, block, after), text, id);
    }
  }
});

test('a renamed block changes only the id of its heading', () => {
  assert.equal(
    renameSectionBlock(`${PLANS.join('\n')}\n`, 'plans-2'),
    '## plans-2\nPurpose: Compare the plans.\nComponents: Card, Button\n',
  );
  assert.equal(
    renameSectionBlock('##  plans  \r\nPurpose: plans', 'plans-2'),
    '##  plans-2  \r\nPurpose: plans',
  );
  assert.equal(renameSectionBlock('Plain text', 'x'), 'Plain text');
});
