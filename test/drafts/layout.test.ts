import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutIssues, parseLayout } from '../../src/drafts/domain/layout.ts';

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
