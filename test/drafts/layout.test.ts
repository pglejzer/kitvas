import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutIssues, parseLayout } from '../../src/drafts/domain/layout.ts';
import { layoutTemplate } from '../../src/drafts/domain/templates.ts';

const KNOWN = new Set(['Heading', 'Text', 'Button', 'Card']);

const GOOD = [
  '# Layout: Rent a bike',
  '',
  '<!-- a note',
  '## not-a-section',
  '-->',
  '',
  '## hero',
  'Purpose: Say what the screen is for.',
  'Components: Heading, Text,Button',
  'Free notes are ignored.',
  '',
  '## order-summary',
  '- purpose: List what the user pays for.',
  '- Components: Card',
  '### a sub heading is not a section',
].join('\r\n');

test('reads the title, the sections, their purpose and components', () => {
  const layout = parseLayout(GOOD);
  assert.equal(layout.title, 'Rent a bike');
  assert.deepEqual(layout.sections, [
    {
      id: 'hero',
      purpose: 'Say what the screen is for.',
      components: ['Heading', 'Text', 'Button'],
      line: 7,
    },
    {
      id: 'order-summary',
      purpose: 'List what the user pays for.',
      components: ['Card'],
      line: 12,
    },
  ]);
  assert.deepEqual(layoutIssues(layout, KNOWN), []);
});

test('the shared block is kept as text and is not a section', () => {
  const layout = parseLayout(
    [
      '# Layout: Shop',
      '## hero',
      'Purpose: x',
      'Components: Button',
      '## shared',
      '<!-- dropped',
      'also dropped -->',
      'Page width: 1200px.',
      'Purpose: stays text here',
      '',
      '## footer',
      'Purpose: y',
      'Components: Button',
    ].join('\r\n'),
  );
  assert.equal(layout.shared, 'Page width: 1200px.\nPurpose: stays text here');
  assert.deepEqual(
    layout.sections.map((section) => section.id),
    ['hero', 'footer'],
  );
  assert.deepEqual(layoutIssues(layout, KNOWN), []);
  assert.equal(parseLayout(GOOD).shared, '');
});

test('shared is not a valid section id', () => {
  const layout = {
    title: '',
    shared: '',
    screen: null,
    sections: [{ id: 'shared', purpose: 'x', components: ['Button'], line: 1 }],
  };
  assert.deepEqual(
    layoutIssues(layout, KNOWN).map((issue) => [issue.path, issue.key]),
    [['layout.shared', 'draftIssue.badSectionId']],
  );
});

test('a layout with no sections is a problem', () => {
  const layout = parseLayout('# Layout: Empty\n\n<!-- nothing yet -->\n');
  assert.deepEqual(layout.sections, []);
  assert.deepEqual(layoutIssues(layout, KNOWN), [
    { path: 'layout', key: 'draftIssue.noSections', params: {} },
  ]);
});

test('each section problem is reported with the section in its path', () => {
  const layout = parseLayout(
    [
      '## Hero Banner',
      'Purpose: x',
      'Components: Heading',
      '## list',
      'Components: Heading',
      '## list',
      'Purpose: y',
      '## footer',
      'Purpose: z',
      'Components: Heading, Table',
    ].join('\n'),
  );
  assert.deepEqual(
    layoutIssues(layout, KNOWN).map((issue) => [issue.path, issue.key, issue.params]),
    [
      ['layout.Hero Banner', 'draftIssue.badSectionId', { id: 'Hero Banner' }],
      ['layout.list', 'draftIssue.noPurpose', { id: 'list' }],
      ['layout.list', 'draftIssue.duplicateSection', { id: 'list' }],
      ['layout.list', 'draftIssue.noComponents', { id: 'list' }],
      ['layout.footer', 'draftIssue.unknownComponent', { id: 'footer', name: 'Table' }],
    ],
  );
});

const SECTION = ['## hero', 'Purpose: x', 'Components: Button'];

test('a Screen line above the sections names the kind; case, spaces and a list mark are fine', () => {
  const read = (line: string) => parseLayout(['# Layout: Shop', line, '', ...SECTION].join('\n'));
  assert.equal(read('Screen: sign-up').screen, 'sign-up');
  assert.equal(read('  - screen :  Checkout  ').screen, 'checkout');
  assert.equal(read('SCREEN:LANDING').screen, 'landing');
  assert.deepEqual(layoutIssues(read('Screen: list'), KNOWN), []);
  assert.equal(read('Screen: list').unknownScreen, undefined);
  // The first line counts.
  assert.equal(read('Screen: form\nScreen: list').screen, 'form');
});

test('without a Screen line the kind is null, and a Screen line in a section is only text', () => {
  assert.equal(parseLayout(SECTION.join('\n')).screen, null);
  const late = parseLayout([...SECTION, 'Screen: landing', '## shared', 'Screen: form'].join('\n'));
  assert.equal(late.screen, null);
  assert.equal(late.unknownScreen, undefined);
  assert.equal(late.shared, 'Screen: form');
  assert.deepEqual(layoutIssues(late, KNOWN), []);
  // Below a `## shared` heading at the top it is shared text too.
  const shared = parseLayout(['## shared', 'Screen: form', ...SECTION].join('\n'));
  assert.equal(shared.screen, null);
  assert.equal(shared.shared, 'Screen: form');
  // A commented line does not count.
  assert.equal(parseLayout(['<!-- Screen: form -->', ...SECTION].join('\n')).screen, null);
});

test('a Screen line with an unknown kind is an issue that lists the kinds', () => {
  const layout = parseLayout(['# Layout: Shop', 'Screen: Homepage', ...SECTION].join('\n'));
  assert.equal(layout.screen, null);
  assert.equal(layout.unknownScreen, 'homepage');
  assert.deepEqual(layoutIssues(layout, KNOWN), [
    {
      path: 'layout',
      key: 'draftIssue.unknownScreen',
      params: {
        kind: 'homepage',
        kinds:
          'landing, form, sign-in, sign-up, checkout, dashboard, list, detail, article, settings, other',
      },
    },
  ]);
  // It comes before the missing sections, the order they are written in.
  assert.deepEqual(
    layoutIssues(parseLayout('Screen:\n'), KNOWN).map((issue) => [issue.key, issue.params.kind]),
    [
      ['draftIssue.unknownScreen', ''],
      ['draftIssue.noSections', undefined],
    ],
  );
});

test('the layout scaffold explains the Screen line in a comment, so it sets no kind', () => {
  const scaffold = layoutTemplate('Shop');
  assert.match(scaffold, /one line "Screen: <kind>"/);
  assert.match(scaffold, /landing, form, sign-in, sign-up, checkout, dashboard/);
  const layout = parseLayout(scaffold);
  assert.equal(layout.screen, null);
  assert.equal(layout.unknownScreen, undefined);
});
