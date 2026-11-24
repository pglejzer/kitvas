import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../../../../../client/channel/edit-protocol.ts';
import type { LiveFact } from '../../../../../client/channel/live-protocol.ts';
import {
  changedFiles,
  codeItem,
  coveredIds,
  expectations,
  joinExpectations,
  LIVE_RULE_IDS,
  type LiveGroup,
  liveGroups,
  liveMarks,
  mismatchedIds,
  sentOps,
  topsOf,
  withCodeAnswer,
  withFrameAnswer,
} from '../../../../../client/studio/edit/live/items.ts';
import type { Gesture, LiveItem } from '../../../../../client/studio/edit/store.ts';
import type { EditOp } from '../../../../../src/edit/index.ts';
import type { LiveCodeFinding } from '../../../../../src/studio/api/edit/live-schemas.ts';
import type { Waiver } from '../../../../../src/studio/api/waivers/waiver-schemas.ts';

const SECTION = 'sections/Hero:section';
const TITLE = 'sections/Hero:section/h1';
const BUTTON = 'sections/Hero:section/button';
const OTHER = 'sections/Footer:footer';
const SCSS = 'src/scss/sections/hero.scss';
const TSX = 'src/tsx/sections/Hero.tsx';

const tree: TreeNode[] = [
  { id: SECTION, parent: null, name: 'Hero', count: 1 },
  { id: TITLE, parent: SECTION, name: 'Title', count: 1 },
  { id: BUTTON, parent: SECTION, name: 'Go', count: 1 },
  { id: OTHER, parent: null, name: 'Footer', count: 1 },
];

const fact = (
  id: string,
  rule: LiveFact['rule'],
  severity: LiveFact['severity'] = 'review',
): LiveFact => ({ id, rule, severity, values: {} });

const item = (patch: Partial<LiveItem>): LiveItem => ({
  id: TITLE,
  rule: LIVE_RULE_IDS.contrast,
  severity: 'fix',
  width: 1280,
  message: 'low contrast',
  source: 'frame',
  ...patch,
});

const finding = (patch: Partial<LiveCodeFinding>): LiveCodeFinding => ({
  rule: 'ds/raw-color',
  severity: 'fix',
  file: SCSS,
  line: 4,
  element: SECTION,
  message: 'a colour by hand',
  ...patch,
});

const waiver = (rule: string, element: string | null): Waiver => ({
  rule,
  element,
  reason: 'On purpose',
  version: 2,
  at: '2026-11-24T10:00:00.000Z',
});

test("a card's facts become items filed under the full check's rules, at the card's width", () => {
  const answer = { width: 390, facts: [fact(TITLE, 'contrast', 'fix')] };
  const [one] = withFrameAnswer([], answer, new Set());
  assert.ok(one);
  const { message, ...rest } = one;
  assert.deepEqual(rest, {
    id: TITLE,
    rule: 'a11y/color-contrast',
    severity: 'fix',
    width: 390,
    source: 'frame',
  });
  assert.equal(message, 'live.fact.contrast');
});

test('what a measurement covered is the named elements, all under them, and every fact', () => {
  const covered = coveredIds([SECTION], tree, [fact('sections/Nav:nav', 'overflow')]);
  assert.deepEqual([...covered].sort(), [SECTION, BUTTON, TITLE, 'sections/Nav:nav'].sort());
});

test('an answer replaces the earlier items of what it covered at its own width only', () => {
  const items = [
    item({ id: TITLE, width: 1280 }),
    item({ id: TITLE, width: 390 }),
    item({ id: OTHER, width: 1280 }),
    item({ id: TITLE, width: null, source: 'code', rule: 'ds/raw-color' }),
  ];
  const covered = coveredIds([SECTION], tree, []);
  const answer = { width: 1280, facts: [fact(BUTTON, 'target-size')] };
  const next = withFrameAnswer(items, answer, covered);
  assert.deepEqual(
    next.map((one) => [one.id, one.rule, one.width, one.source]),
    [
      [TITLE, 'a11y/color-contrast', 390, 'frame'],
      [OTHER, 'a11y/color-contrast', 1280, 'frame'],
      [TITLE, 'ds/raw-color', null, 'code'],
      [BUTTON, 'a11y/target-size', 1280, 'frame'],
    ],
  );
});

test('a code finding is an item of its element, with no width', () => {
  const one = codeItem(finding({}));
  assert.equal(one.id, SECTION);
  assert.equal(one.width, null);
  assert.equal(one.source, 'code');
  assert.equal(one.rule, 'ds/raw-color');
});

test('the files an edit wrote are the ones whose ETag is new or changed', () => {
  const before = { [TSX]: 'a', [SCSS]: 'b' };
  assert.deepEqual(changedFiles(before, { [TSX]: 'a', [SCSS]: 'c', x: 'd' }), [SCSS, 'x']);
});

test("a request's code findings replace those of each file it wrote; a clean file drops out", () => {
  const control = finding({ file: TSX, rule: 'ds/raw-control', element: BUTTON });
  let byFile = withCodeAnswer(new Map(), [SCSS, TSX], [finding({}), control]);
  assert.deepEqual([...byFile.keys()], [SCSS, TSX]);
  byFile = withCodeAnswer(byFile, [SCSS], []);
  assert.deepEqual([...byFile.keys()], [TSX]);
  // A file the request did not write keeps its findings.
  byFile = withCodeAnswer(byFile, [SCSS], [finding({ rule: 'ds/raw-size', severity: 'review' })]);
  assert.deepEqual(
    [...byFile.entries()].map(([file, items]) => [file, items.map((one) => one.rule)]),
    [
      [TSX, ['ds/raw-control']],
      [SCSS, ['ds/raw-size']],
    ],
  );
});

test('items group by element with their widths; those of no element come last, unnumbered', () => {
  const groups = liveGroups(
    [
      item({ id: null, source: 'code', width: null, rule: 'ds/foreign-import' }),
      item({ id: TITLE, width: 1280 }),
      item({ id: BUTTON, rule: LIVE_RULE_IDS['target-size'], severity: 'review', width: 390 }),
      item({ id: TITLE, width: 390 }),
    ],
    [],
  );
  const widths = (group: LiveGroup): number[][] => group.rows.map((row) => row.widths);
  assert.deepEqual(
    groups.map((group) => [group.id, group.label, group.tone, widths(group)]),
    [
      [TITLE, 'L1', 'fix', [[390, 1280]]],
      [BUTTON, 'L2', 'review', [[390]]],
      [null, null, 'fix', [[]]],
    ],
  );
});

test('a waived finding shows as accepted; an element with only waived ones has no number', () => {
  const groups = liveGroups(
    [
      item({ id: TITLE }),
      item({ id: BUTTON, rule: LIVE_RULE_IDS['target-size'], severity: 'review' }),
      item({ id: BUTTON, rule: LIVE_RULE_IDS.overflow, severity: 'review', message: 'wide' }),
    ],
    [waiver(LIVE_RULE_IDS.contrast, TITLE), waiver(LIVE_RULE_IDS['target-size'], BUTTON)],
  );
  assert.deepEqual(
    groups.map((group) => [group.id, group.label, group.rows.map((row) => row.waived)]),
    [
      [TITLE, null, [true]],
      [BUTTON, 'L1', [true, false]],
    ],
  );
  // A waiver of another element is not this one's.
  const elsewhere = liveGroups([item({ id: OTHER })], [waiver(LIVE_RULE_IDS.contrast, TITLE)]);
  assert.equal(elsewhere[0]?.label, 'L1');
});

test('each card gets the marks of the findings open at its width, and every code finding', () => {
  const groups = liveGroups(
    [
      item({ id: TITLE, width: 1280 }),
      item({ id: BUTTON, rule: LIVE_RULE_IDS['target-size'], severity: 'review', width: 390 }),
      item({ id: SECTION, rule: 'ds/raw-size', severity: 'review', width: null, source: 'code' }),
    ],
    [],
  );
  assert.deepEqual(liveMarks(groups, 1280), [
    { id: TITLE, label: 'L1', tone: 'fix' },
    { id: SECTION, label: 'L3', tone: 'review' },
  ]);
  assert.deepEqual(liveMarks(groups, 390), [
    { id: BUTTON, label: 'L2', tone: 'review' },
    { id: SECTION, label: 'L3', tone: 'review' },
  ]);
});

test('elements whose build differs from the editor are found for the change list', () => {
  const items = [
    item({ id: TITLE, rule: LIVE_RULE_IDS.mismatch, severity: 'review' }),
    item({ id: BUTTON }),
    item({ id: null, rule: LIVE_RULE_IDS.mismatch }),
  ];
  assert.deepEqual([...mismatchedIds(items)], [TITLE]);
});

const setStyle = (
  property: string,
  value: string,
  context?: { width: number | null; state: 'hover' | null },
): EditOp => ({
  op: 'setStyle',
  id: TITLE,
  className: 'title',
  property,
  value: { raw: value },
  before: null,
  newRule: false,
  ...(context ? { context } : {}),
});

const gesture = (ops: EditOp[]): Gesture => ({ ops, label: 'Edit' });

test('the ops a request sent are found on top of the stack it moved', () => {
  const step = gesture([setStyle('gap', '8px')]);
  const back = gesture([setStyle('gap', '4px')]);
  const before = topsOf({ undo: [], redo: [] });
  // An edit or a redo: the undo stack's top is new.
  assert.deepEqual(sentOps(before, topsOf({ undo: [step], redo: [] })), step.ops);
  // An undo: the step it sent is on the redo stack now.
  const undone = topsOf({ undo: [], redo: [back] });
  assert.deepEqual(sentOps(topsOf({ undo: [step], redo: [] }), undone), back.ops);
  assert.deepEqual(sentOps(undone, undone), []);
});

test('the editor shows only values of the context the edit card is in', () => {
  const words: EditOp = { op: 'setText', id: TITLE, value: 'Hi', before: 'Hello' };
  const ops = [
    setStyle('gap', '8px'),
    setStyle('padding', '24px', { width: 768, state: null }),
    setStyle('gap', '12px'),
    words,
  ];
  assert.deepEqual(expectations(ops, null), [{ id: TITLE, property: 'gap', value: '12px' }]);
  assert.deepEqual(expectations(ops, 768), [{ id: TITLE, property: 'padding', value: '24px' }]);
});

test('a state edit is held against the build only while that state is forced', () => {
  const ops = [
    setStyle('gap', '8px'),
    setStyle('padding', '24px', { width: null, state: 'hover' }),
    setStyle('margin', '4px', { width: 768, state: 'hover' }),
  ];
  const hover = expectations(ops, null, 'hover');
  assert.deepEqual(hover, [{ id: TITLE, property: 'padding', value: '24px' }]);
  const wide = expectations(ops, 768, 'hover');
  assert.deepEqual(wide, [{ id: TITLE, property: 'margin', value: '4px' }]);
  assert.deepEqual(expectations(ops, null, 'active'), []);
  assert.deepEqual(expectations(ops, null), [{ id: TITLE, property: 'gap', value: '8px' }]);
});

test('two requests that wait for one build hold the later value of a property', () => {
  const first = [
    { id: TITLE, property: 'gap', value: '8px' },
    { id: TITLE, property: 'color', value: 'red' },
  ];
  const next = [{ id: TITLE, property: 'gap', value: '12px' }];
  assert.deepEqual(joinExpectations(first, next), [
    { id: TITLE, property: 'gap', value: '12px' },
    { id: TITLE, property: 'color', value: 'red' },
  ]);
});
