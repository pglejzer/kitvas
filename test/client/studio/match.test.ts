import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  afterOtherChange,
  exactPairs,
  MATCH_THRESHOLD,
  matchIds,
  pathCloseness,
  propLikeness,
  textLikeness,
} from '../../../client/studio/edit/match.ts';
import { initialState } from '../../../client/studio/edit/store.ts';
import type { EditOp } from '../../../src/edit/index.ts';
import type { StructureEntry } from '../../../src/studio/api/structure-schemas.ts';

const FILE = 'src/tsx/sections/Pricing.tsx';
const ROOT = 'sections/Pricing:section';
const hash = (n: number): string => n.toString(16).padStart(16, '0');

/** An element of the Pricing section at `path` under its root (`Stack/Card.2`). */
function el(path: string, fields: Partial<StructureEntry> = {}): StructureEntry {
  const parts = path.split('/');
  const parent = parts.slice(0, -1).join('/');
  return {
    id: `${ROOT}/${path}`,
    file: FILE,
    tag: (parts.at(-1) ?? '').replace(/\.\d+$/, ''),
    parent: parent === '' ? ROOT : `${ROOT}/${parent}`,
    hash: hash(1),
    text: null,
    props: [],
    component: null,
    movable: null,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
    ...fields,
  };
}
const root = (n = 100): StructureEntry => ({
  ...el('x'),
  id: ROOT,
  tag: 'section',
  parent: null,
  hash: hash(n),
  root: 'section',
});
const id = (path: string): string => `${ROOT}/${path}`;
const BASIC = id('Stack/Card');
const PRO = id('Stack/Card.2');

const card = (path: string, text: string, n: number): StructureEntry =>
  el(path, { text, hash: hash(n), props: ['variant'], component: 'Card' });

/** The section before Claude's change: a stack of a Basic and a Pro card. */
const twoCards = (): StructureEntry[] => [
  root(),
  el('Stack'),
  card('Stack/Card', 'Basic', 3),
  card('Stack/Card.2', 'Pro', 4),
];
/** The same section with the Basic card removed: the Pro card takes its id. */
const proOnly = (): StructureEntry[] => [
  root(101),
  el('Stack', { hash: hash(5) }),
  card('Stack/Card', 'Pro', 4),
];

test('an unchanged element keeps its id', () => {
  const list = [root(), el('Stack', { hash: hash(2) }), card('Stack/Card', 'Basic', 3)];
  assert.deepEqual(matchIds([BASIC], list, list), { [BASIC]: BASIC });
});

test('match follows a moved Card with the same text', () => {
  const after = [
    root(101),
    el('Stack', { hash: hash(5) }),
    card('Stack/Card', 'Pro', 4),
    card('Stack/Card.2', 'Basic', 3),
  ];
  assert.deepEqual(matchIds([BASIC, PRO], twoCards(), after), { [BASIC]: PRO, [PRO]: BASIC });
});

test('a moved Card whose source changed is found by its text', () => {
  const before = [root(), el('Stack'), el('Grid', { hash: hash(9) }), card('Stack/Card', 'Pro', 4)];
  // Claude moved it into the grid and wrote it again: another hash, the same text.
  const after = [
    root(101),
    el('Stack'),
    el('Grid', { hash: hash(8) }),
    card('Grid/Card', 'Pro', 6),
  ];
  assert.deepEqual(matchIds([BASIC], before, after), { [BASIC]: id('Grid/Card') });
});

test('a container is found by the texts inside it', () => {
  const before = [
    root(),
    el('Stack'),
    el('Stack/Card', { hash: hash(3) }),
    el('Stack/Card/Text', { hash: hash(30), text: 'Basic' }),
    el('Stack/Card.2', { hash: hash(4) }),
    el('Stack/Card.2/Text', { hash: hash(40), text: 'Pro plan' }),
  ];
  const after = [
    root(101),
    el('Stack', { hash: hash(5) }),
    el('Stack/Card', { hash: hash(3) }),
    el('Stack/Card/Text', { hash: hash(30), text: 'Basic' }),
    el('Grid', { hash: hash(9) }),
    el('Grid/Card', { hash: hash(7) }),
    el('Grid/Card/Text', { hash: hash(40), text: 'Pro plan' }),
  ];
  assert.deepEqual(matchIds([PRO], before, after), { [PRO]: id('Grid/Card') });
});

test('siblings a new element pushed on are followed', () => {
  const after = [
    root(101),
    el('Stack', { hash: hash(5) }),
    card('Stack/Card', 'Free', 6),
    card('Stack/Card.2', 'Basic', 3),
    card('Stack/Card.3', 'Pro', 4),
  ];
  assert.deepEqual(matchIds([BASIC, PRO], twoCards(), after), {
    [BASIC]: PRO,
    [PRO]: id('Stack/Card.3'),
  });
});

test('match gives null for a deleted Card, even when a sibling took its id', () => {
  assert.deepEqual(matchIds([BASIC, PRO], twoCards(), proOnly()), {
    [BASIC]: null,
    [PRO]: BASIC,
  });
});

test('a Card with no text in common with any other is not matched', () => {
  const after = [...proOnly(), el('Grid', { hash: hash(9) }), card('Grid/Card', 'Enterprise', 6)];
  assert.deepEqual(matchIds([BASIC], twoCards(), after), { [BASIC]: null });
});

test('an element Claude edited in place keeps its id', () => {
  const before = [root(), el('Stack'), card('Stack/Card', 'Basic', 3)];
  const after = [root(101), el('Stack', { hash: hash(5) }), card('Stack/Card', 'Starter', 6)];
  assert.deepEqual(matchIds([BASIC], before, after), { [BASIC]: BASIC });
});

test('an id the structure did not know is kept', () => {
  const hero = 'index:main/Hero';
  assert.deepEqual(matchIds([hero], [root()], []), { [hero]: hero });
});

test('two held ids never end on one element', () => {
  const before = [
    root(),
    el('Stack'),
    card('Stack/Card', 'Pro', 3),
    card('Stack/Card.2', 'Pro', 4),
  ];
  const after = [root(101), el('Grid', { hash: hash(9) }), card('Grid/Card', 'Pro', 6)];
  const matched = matchIds([BASIC, PRO], before, after);
  const found = Object.values(matched).filter((value) => value !== null);
  assert.deepEqual(found, [id('Grid/Card')]);
});

test('identical elements are paired by the same id first, then in document order', () => {
  const twin = (path: string): StructureEntry => card(path, 'Plan', 3);
  const before = [twin('Stack/Card'), twin('Stack/Card.2')];
  const after = [card('Stack/Card', 'New', 7), twin('Stack/Card.2'), twin('Stack/Card.3')];
  const pairs = exactPairs(before, after);
  assert.equal(pairs.get(PRO), PRO);
  assert.equal(pairs.get(BASIC), id('Stack/Card.3'));
});

test('the scores behind a match', () => {
  assert.equal(textLikeness(['pro', 'plan'], ['pro', 'plan']), 1);
  assert.equal(textLikeness([], []), 0);
  assert.equal(textLikeness(['a', 'b'], ['a', 'c']), 0.5);
  assert.equal(propLikeness([], []), 1);
  assert.equal(propLikeness(['variant', 'size'], ['variant']), 0.5);
  assert.equal(pathCloseness(PRO, id('Stack/Card.3')), 1);
  assert.equal(pathCloseness(BASIC, id('Grid/Card')), 1 / 3);
  // The same text decides on its own; a third of it, with the same props and place, does not.
  assert.ok(3 * 1 >= MATCH_THRESHOLD);
  assert.ok(3 * 0.3 + 1 + 1 < MATCH_THRESHOLD);
});

test('after Claude changed the section the selection and the steps follow, and a lost one is said', () => {
  const onPro: EditOp = {
    op: 'setProp',
    id: PRO,
    name: 'variant',
    value: { kind: 'string', value: 'outline' },
    before: { kind: 'string', value: 'solid' },
    after: null,
  };
  const onBasic: EditOp = { ...onPro, id: BASIC };
  const state = {
    ...initialState('demo'),
    selection: [BASIC, PRO],
    undo: [
      { ops: [onBasic], label: 'Basic' },
      { ops: [onPro], label: 'Pro' },
    ],
  };
  const { patch, lost } = afterOtherChange(state, twoCards(), proOnly());
  assert.equal(lost, true);
  assert.deepEqual(patch.selection, [BASIC]);
  // The step on the removed card goes: its id is the Pro card's now.
  assert.deepEqual(
    patch.undo?.map((step) => step.label),
    ['Pro'],
  );
  assert.deepEqual(patch.undo?.[0]?.ops, [{ ...onPro, id: BASIC }]);
});

test('after a change that moved nothing held, nothing changes and nothing is lost', () => {
  const list = twoCards();
  const state = { ...initialState('demo'), selection: [BASIC] };
  assert.deepEqual(afterOtherChange(state, list, list), { patch: {}, lost: false });
});
