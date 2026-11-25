// The item ops by path (ADR 0065): a list inside a list item is the array of the outer item the
// path names. A move, a copy and a removal change that one array; a move with another parent in
// `toPath` takes the item out of its array and puts it into that parent's, in one change.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyListEdit, type ListOp, type ListResult } from '../../../src/edit/domain/list/edit.ts';
import { aroundOf, copyPlace, innerArrayAt } from '../../../src/edit/domain/list/nest.ts';
import { listView } from '../../../src/edit/domain/list/view.ts';
import { EditOpSchema, MAX_LIST_DEPTH } from '../../../src/edit/domain/ops.ts';

const ROW = 'sections/Plans:section/Card/ul/li';

type Plan = { name: string; features: string[] };

const quoted = (texts: string[]): string => texts.map((text) => `'${text}'`).join(', ');

/** The plans section; each plan's features on one line, or one feature a line with `tall`. */
function plans(list: Plan[], tall = false): string {
  const items = list.map((plan) =>
    tall
      ? [
          '  {',
          `    name: '${plan.name}',`,
          plan.features.length === 0
            ? '    features: [],'
            : ['    features: [', ...plan.features.map((one) => `      '${one}',`), '    ],'].join(
                '\n',
              ),
          '  },',
        ].join('\n')
      : `  { name: '${plan.name}', features: [${quoted(plan.features)}] },`,
  );
  return [
    "import { Card, Heading } from '@kit';",
    '',
    'const PLANS = [',
    ...items,
    '];',
    '',
    'export function Plans() {',
    '  return (',
    '    <section className="plans">',
    '      {PLANS.map((plan) => (',
    '        <Card key={plan.name}>',
    '          <Heading>{plan.name}</Heading>',
    '          <ul>',
    '            {plan.features.map((feature) => (',
    '              <li key={feature}>',
    '                <span>{feature}</span>',
    '              </li>',
    '            ))}',
    '          </ul>',
    '        </Card>',
    '      ))}',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
}

const STARTER = ['Up to 3 projects', 'Kanban and list views'];
const PRO = ['Everything in Starter', 'Timeline'];
const BUSINESS = ['Everything in Pro'];

const three = (starter: string[], pro: string[], business: string[]): Plan[] => [
  { name: 'Starter', features: starter },
  { name: 'Pro', features: pro },
  { name: 'Business', features: business },
];

const START = plans(three(STARTER, PRO, BUSINESS));

function at(text: string, tag: string): number {
  const found = text.indexOf(`<${tag}`);
  if (found < 0) throw new Error(`no <${tag}`);
  return found;
}

const run = (text: string, tag: string, op: ListOp): ListResult =>
  applyListEdit(text, at(text, tag), op, { force: false });

function edited(text: string, op: ListOp): string {
  const result = run(text, 'li', op);
  assert.ok('text' in result, JSON.stringify(result));
  return result.text;
}

const last = (path: number[]): number => path[path.length - 1] ?? 0;
const move = (path: number[], toPath: number[]): ListOp => ({
  op: 'moveItem',
  id: ROW,
  item: last(path),
  to: last(toPath),
  path,
  toPath,
});
const remove = (path: number[]): ListOp => ({ op: 'removeItem', id: ROW, item: last(path), path });
const duplicate = (path: number[]): ListOp => ({
  op: 'duplicateItem',
  id: ROW,
  item: last(path),
  path,
});

test('the item ops take a path, and a move a path to go to, within the bounds of a path', () => {
  const good = [move([0, 1], [2, 0]), remove([1]), duplicate([]), remove([0, 0, 0, 0, 0, 0, 0, 0])];
  for (const op of good) assert.equal(EditOpSchema.safeParse(op).success, true, JSON.stringify(op));
  const bad = [
    { ...remove([0]), path: [-1] },
    { ...remove([0]), path: [0.5] },
    { ...remove([0]), path: Array.from({ length: MAX_LIST_DEPTH + 1 }, () => 0) },
    { ...move([0], [1]), toPath: '1' },
    // Only a move names a place to go.
    { ...remove([0]), toPath: [1] },
    { ...duplicate([0]), toPath: [1] },
  ];
  for (const op of bad) assert.equal(EditOpSchema.safeParse(op).success, false, JSON.stringify(op));
});

test('a reorder in a nested list changes the array of that one parent', () => {
  const swapped = ['Kanban and list views', 'Up to 3 projects'];
  assert.equal(edited(START, move([0, 0], [0, 1])), plans(three(swapped, PRO, BUSINESS)));
  assert.equal(
    edited(START, move([1, 1], [1, 0])),
    plans(three(STARTER, ['Timeline', 'Everything in Starter'], BUSINESS)),
  );
  // Without `toPath` the index `to` is the place in the item's own array.
  const plain: ListOp = { op: 'moveItem', id: ROW, item: 1, to: 0, path: [0, 1] };
  assert.equal(edited(START, plain), plans(three(swapped, PRO, BUSINESS)));
  assert.equal(edited(START, move([1, 1], [1, 1])), START);
});

test('a copy and a removal by path touch the array of that parent only', () => {
  assert.equal(edited(START, remove([1, 0])), plans(three(STARTER, ['Timeline'], BUSINESS)));
  assert.equal(edited(START, remove([2, 0])), plans(three(STARTER, PRO, [])));
  assert.equal(
    edited(START, duplicate([2, 0])),
    plans(three(STARTER, PRO, ['Everything in Pro', 'Everything in Pro'])),
  );
});

test('an item moves into the same list of another parent, before or after its own', () => {
  // From a later array into an earlier one, between two rows.
  assert.equal(
    edited(START, move([2, 0], [0, 1])),
    plans(three(['Up to 3 projects', 'Everything in Pro', 'Kanban and list views'], PRO, [])),
  );
  // From an earlier array to the end of a later one.
  assert.equal(
    edited(START, move([0, 0], [2, 1])),
    plans(three(['Kanban and list views'], PRO, ['Everything in Pro', 'Up to 3 projects'])),
  );
  // To the front, and into an array with no item.
  assert.equal(
    edited(START, move([1, 1], [0, 0])),
    plans(three(['Timeline', ...STARTER], ['Everything in Starter'], BUSINESS)),
  );
  const empty = plans(three(STARTER, PRO, []));
  assert.equal(
    edited(empty, move([0, 1], [2, 0])),
    plans(three(['Up to 3 projects'], PRO, ['Kanban and list views'])),
  );
});

test('a move across arrays keeps the line breaks and the indentation each array writes', () => {
  const tall = plans(three(STARTER, PRO, BUSINESS), true);
  assert.equal(
    edited(tall, move([2, 0], [0, 1])),
    plans(three(['Up to 3 projects', 'Everything in Pro', 'Kanban and list views'], PRO, []), true),
  );
  assert.equal(
    edited(tall, move([0, 0], [1, 2])),
    plans(three(['Kanban and list views'], [...PRO, 'Up to 3 projects'], BUSINESS), true),
  );
});

test('the offsets of the elements follow a move across arrays', () => {
  const result = run(START, 'li', move([2, 0], [0, 1]));
  assert.ok('moved' in result);
  for (const tag of ['section', 'Card', 'ul', 'li', 'span']) {
    assert.equal(result.moved(at(START, tag)), at(result.text, tag), tag);
  }
  // The moved item's own text went with it; the comma it left behind is gone.
  const item = START.indexOf("'Everything in Pro'");
  assert.equal(result.moved(item), result.text.indexOf("'Everything in Pro'"));
  assert.equal(result.moved(0), 0);
});

test('an item op on anything but the root of its list is refused: not-list-item', () => {
  const part: ListOp = { op: 'removeItem', id: `${ROW}/span`, item: 0, path: [0, 0] };
  assert.deepEqual(run(START, 'span', part), { refused: 'not-list-item' });
  // A part of the outer item, with the path of the one list around it.
  for (const tag of ['Heading', 'ul']) {
    const op: ListOp = { op: 'duplicateItem', id: ROW, item: 0, path: [0] };
    assert.deepEqual(run(START, tag, op), { refused: 'not-list-item' }, tag);
  }
  // The outer item is a root: its ops work by its own path.
  const card: ListOp = { op: 'removeItem', id: ROW, item: 1, path: [1] };
  const result = run(START, 'Card', card);
  assert.ok('text' in result);
  assert.equal(result.text, plans(three(STARTER, PRO, BUSINESS).filter((_, index) => index !== 1)));
});

test('a place that is not there is refused, and so is a path of another length', () => {
  const gone: [ListOp, string][] = [
    [remove([0, 2]), 'list-item-gone'],
    [remove([3, 0]), 'list-item-gone'],
    [duplicate([1, 5]), 'list-item-gone'],
    // The same list: an index past its end. Another parent: one past "after the last".
    [move([0, 0], [0, 2]), 'list-item-gone'],
    [move([0, 0], [1, 3]), 'list-item-gone'],
    [move([0, 0], [7, 0]), 'list-item-gone'],
    [remove([0]), 'not-found'],
    [remove([0, 0, 0]), 'not-found'],
    [move([0, 0], [1]), 'not-found'],
    // A nested item without its path: the editor cannot say which array is meant.
    [{ op: 'removeItem', id: ROW, item: 0 }, 'list-not-literal'],
  ];
  for (const [op, refused] of gone) {
    assert.deepEqual(run(START, 'li', op), { refused }, JSON.stringify(op));
  }
  // "After the last" of another parent is a place.
  assert.equal(
    edited(START, move([0, 0], [1, 2])),
    plans(three(['Kanban and list views'], [...PRO, 'Up to 3 projects'], BUSINESS)),
  );
});

test('an inner list that is no field of the outer item is refused: list-not-literal', () => {
  const sliced = START.replace('plan.features.map(', 'plan.features.slice(1).map(');
  assert.notEqual(sliced, START);
  assert.deepEqual(run(sliced, 'li', remove([0, 0])), { refused: 'list-not-literal' });
  const withProp = 'function Plans({ PLANS }: { PLANS: Plan[] }) {';
  const prop = START.replace('function Plans() {', withProp);
  assert.deepEqual(run(prop, 'li', remove([0, 0])), { refused: 'list-not-literal' });
});

test('two parents that show one array move the item inside that array', () => {
  const shared = START.replace('plan.features.map(', "['a', 'b', 'c'].map(");
  assert.notEqual(shared, START);
  const done = edited(shared, move([0, 0], [2, 3]));
  assert.equal(done, shared.replace("['a', 'b', 'c']", "['b', 'c', 'a']"));
  const back = edited(shared, move([1, 2], [0, 0]));
  assert.equal(back, shared.replace("['a', 'b', 'c']", "['c', 'a', 'b']"));
});

test('the inner array of a copy is read by the places of its parents', () => {
  const levels = aroundOf(START, at(START, 'li'))?.levels ?? [];
  assert.equal(levels.length, 2);
  const counts = [0, 1, 2].map((parent) => {
    const array = innerArrayAt(levels, [parent]);
    return typeof array === 'string' ? array : array.items.length;
  });
  assert.deepEqual(counts, [2, 2, 1]);
  assert.equal(innerArrayAt(levels, [3]), 'list-item-gone');
  assert.equal(innerArrayAt(levels, []), 'not-found');
  // Among all the rows of the page: Starter's two, Pro's two, Business's one.
  assert.deepEqual(copyPlace(levels, [0, 1]), { copy: 1, copies: 5 });
  assert.deepEqual(copyPlace(levels, [2, 0]), { copy: 4, copies: 5 });
  assert.equal(copyPlace(levels, [2, 1]), null);
  assert.equal(copyPlace(levels, [1]), null);
});

test('the inspect reads a nested list for the copy its path names', () => {
  const row = at(START, 'li');
  assert.deepEqual(listView(START, row, [2, 0]), {
    kind: 'literal',
    count: 1,
    reason: null,
    texts: null,
    root: true,
    copy: 4,
    copies: 5,
  });
  // Without a path: writable, but no one array to count.
  assert.deepEqual(listView(START, row), {
    kind: 'literal',
    count: null,
    reason: null,
    texts: null,
    root: true,
  });
  // A part of the row stands in the same list and is no root; `copy` is its row's place.
  assert.deepEqual(listView(START, at(START, 'span'), [1, 0]), {
    kind: 'literal',
    count: 2,
    reason: null,
    texts: null,
    root: false,
    copy: 2,
    copies: 5,
  });
  // The outer list answers as a list in no other list does, and says it is a root.
  const card = listView(START, at(START, 'Card'), [1]);
  assert.deepEqual(
    [card?.kind, card?.count, card?.root, card?.copy, card?.copies],
    ['literal', 3, true, 1, 3],
  );
  assert.equal(listView(START, at(START, 'Heading'))?.root, false);
  assert.equal(listView(START, at(START, 'section')), null);
  const gone = listView(START, row, [5, 0]);
  assert.deepEqual([gone?.kind, gone?.reason, gone?.copy], ['computed', 'list-not-literal', null]);
});
