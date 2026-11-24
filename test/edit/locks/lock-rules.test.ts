import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changesLock, type HeldLock, type Touch } from '../../../src/edit/app/locks/lock-rules.ts';
import { elementSpan, parentOf } from '../../../src/edit/index.ts';

const TEXT = [
  "import { Button, Card, Stack, Text } from '@kit';",
  '',
  'export function Hero() {',
  '  return (',
  '    <section className="hero">',
  '      <Stack gap="md">',
  '        <Text>First</Text>',
  '        <Card className="promo">',
  '          <Text className="title">Inside</Text>',
  '        </Card>',
  '        <Button>Go</Button>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const at = (needle: string): number => {
  const found = TEXT.indexOf(needle);
  assert.ok(found >= 0, needle);
  return found;
};
const spanAt = (needle: string) => {
  const span = elementSpan(TEXT, at(needle));
  assert.ok(span !== null, needle);
  return span;
};

const SECTION = at('<section');
const STACK = at('<Stack');
const FIRST = at('<Text>First');
const CARD = at('<Card');
const INSIDE = at('<Text className="title"');

/** The Card is locked; it keeps its source collapsed. */
const lock: HeldLock = {
  span: spanAt('<Card'),
  parent: parentOf(TEXT, CARD),
  classes: ['promo', 'title'],
  kept: TEXT.slice(spanAt('<Card').start, spanAt('<Card').end).replace(/\s+/g, ' ').trim(),
};

const rows: [string, Touch, boolean][] = [
  ['a prop of the locked element', { kind: 'element', at: CARD }, true],
  ['the text of an element inside it', { kind: 'element', at: INSIDE }, true],
  ['a prop of its parent', { kind: 'element', at: STACK }, false],
  ['a prop of a sibling', { kind: 'element', at: FIRST }, false],
  ['deleting it', { kind: 'subtree', span: spanAt('<Card') }, true],
  ['deleting an element inside it', { kind: 'subtree', span: spanAt('<Text className') }, true],
  ['deleting an ancestor', { kind: 'subtree', span: spanAt('<Stack') }, true],
  ['deleting a sibling', { kind: 'subtree', span: spanAt('<Button') }, false],
  ['unwrapping it', { kind: 'unwrap', at: CARD }, true],
  ['unwrapping an element inside it', { kind: 'unwrap', at: INSIDE }, true],
  ['unwrapping an ancestor', { kind: 'unwrap', at: STACK }, false],
  ['adding a child to it', { kind: 'into', at: CARD }, true],
  ['adding a child to an element inside it', { kind: 'into', at: INSIDE }, true],
  ['adding a child to its parent', { kind: 'into', at: STACK }, false],
  ['adding or moving an element beside it', { kind: 'beside', at: CARD }, false],
  ['adding or moving an element beside one inside it', { kind: 'beside', at: INSIDE }, true],
  ['moving an ancestor', { kind: 'beside', at: STACK }, false],
  [
    'wrapping it with its siblings',
    { kind: 'wrap', span: { start: FIRST, end: spanAt('<Card').end }, parent: STACK },
    true,
  ],
  ['wrapping its siblings only', { kind: 'wrap', span: spanAt('<Button'), parent: STACK }, false],
  ['wrapping an ancestor', { kind: 'wrap', span: spanAt('<Stack'), parent: SECTION }, false],
  [
    'wrapping the children of an element inside it',
    { kind: 'wrap', span: spanAt('<Text className'), parent: CARD },
    true,
  ],
  ['a class rule an element in it carries', { kind: 'class', name: 'title' }, true],
  ['a class rule nothing in it carries', { kind: 'class', name: 'hero' }, false],
];

for (const [what, touch, refused] of rows) {
  test(`a lock ${refused ? 'refuses' : 'allows'} ${what}`, () => {
    assert.equal(changesLock(touch, lock), refused);
  });
}

test('a paste over the locked element with the source it keeps is its Restore', () => {
  const span = spanAt('<Card');
  assert.equal(changesLock({ kind: 'subtree', span, source: lock.kept }, lock), false);
  assert.equal(changesLock({ kind: 'subtree', span, source: '<Card>Other</Card>' }, lock), true);
});

test('a paste over an ancestor that keeps the locked element as it is goes through', () => {
  const span = spanAt('<Stack');
  const keeps = `<Stack gap="lg"> ${lock.kept} </Stack>`;
  assert.equal(changesLock({ kind: 'subtree', span, source: keeps }, lock), false);
  assert.equal(changesLock({ kind: 'subtree', span, source: '<Stack />' }, lock), true);
});

test('a paste inside the locked element is a change of it, whatever it writes', () => {
  const span = spanAt('<Text className');
  assert.equal(changesLock({ kind: 'subtree', span, source: lock.kept }, lock), true);
});
