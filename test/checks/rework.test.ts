import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Problems, ProtectedItem, RawFinding, VisitInput } from '../../src/checks/index.ts';
import { beforeProblemFindings, protectedFindings, reworkScore } from '../../src/checks/index.ts';
import { node, page, text, visit } from './rules/facts.ts';

const item = (id: string, kind: ProtectedItem['kind'], find: string): ProtectedItem => ({
  id,
  kind,
  find,
});

const textNode = (sample: string) => node({ tag: 'p', text: text(sample) });

const at = (
  width: number,
  nodes: ReturnType<typeof node>[],
  stateKind: VisitInput['stateKind'] = 'baseline',
) => visit(page(nodes, { viewport: [width, 800] }), { stateKind });

const finding = (rule: string): RawFinding => ({
  check: 'ui',
  rule,
  severity: 'review',
  file: null,
  line: 0,
  column: 0,
  element: null,
  message: { key: 'x', params: {} },
  hint: { key: 'y', params: {} },
  states: [],
  widths: [],
});

test('a price written another way still matches', () => {
  const v = at(390, [textNode('Pro plan: $1299 a year')]);
  assert.deepEqual(protectedFindings([item('price', 'price', '$1,299.00')], [v]), []);
});

test('a removed price is a finding with the item id and text', () => {
  const v = at(390, [textNode('Pro plan: $999 a year')]);
  const found = protectedFindings([item('price', 'price', '$1,299.00')], [v]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/protected');
  assert.equal(found[0]?.severity, 'fix');
  assert.equal(found[0]?.element, null);
  assert.deepEqual(found[0]?.message.params, { id: 'price', find: '$1,299.00' });
});

test('a relabelled button matches by containment either way', () => {
  const action = (name: string) =>
    node({
      tag: 'button',
      action: {
        kind: 'button',
        name,
        text: name,
        href: null,
        submit: false,
        disabled: false,
        menu: false,
        current: null,
      },
    });
  const longer = at(390, [action('Start your free trial')]);
  const shorter = at(390, [action('Start free')]);
  assert.deepEqual(protectedFindings([item('cta', 'action', 'Start free trial')], [longer]), []);
  assert.deepEqual(protectedFindings([item('cta', 'action', 'Start free trial')], [shorter]), []);
  assert.equal(protectedFindings([item('cta', 'action', 'Sign in')], [longer]).length, 1);
});

test('a field is found by its label, and a brand by its alt', () => {
  const field = node({
    tag: 'input',
    field: {
      control: 'input',
      type: 'email',
      name: 'email',
      value: '',
      placeholder: '',
      required: true,
      invalid: false,
      autocomplete: '',
      label: 'visible',
      labelText: 'Email address',
      labelBox: null,
      described: [],
      group: -1,
      groupName: '',
      form: -1,
      mark: null,
    },
  });
  const logo = node({ tag: 'img', image: { natural: [40, 40], sized: true, alt: 'Acme logo' } });
  const v = at(390, [field, logo]);
  assert.deepEqual(
    protectedFindings(
      [item('mail', 'field', 'email address'), item('brand', 'brand', 'Acme')],
      [v],
    ),
    [],
  );
  assert.equal(protectedFindings([item('phone', 'field', 'Phone')], [v]).length, 1);
  assert.equal(protectedFindings([item('brand', 'brand', 'Globex')], [v]).length, 1);
});

test('text matches by containment and ignores case and line breaks', () => {
  const v = at(390, [textNode('Ship  faster\nwith Kitvas')]);
  assert.deepEqual(protectedFindings([item('t', 'text', 'SHIP FASTER')], [v]), []);
});

test('non-baseline states are ignored, and a miss at both widths is one merged finding', () => {
  const empty = at(390, [], 'empty');
  assert.deepEqual(protectedFindings([item('t', 'text', 'Hello')], [empty]), []);
  const found = protectedFindings(
    [item('t', 'text', 'Hello')],
    [at(390, [textNode('Bye')]), at(1280, [textNode('Bye')])],
  );
  assert.equal(found.length, 1);
  assert.deepEqual(found[0]?.widths, [390, 1280]);
});

test('empty inputs give no findings', () => {
  assert.deepEqual(protectedFindings([], [at(390, [textNode('x')])]), []);
  assert.deepEqual(protectedFindings([item('t', 'text', 'x')], []), []);
  assert.deepEqual(beforeProblemFindings({ counts: {}, findings: [] }, []), []);
  assert.deepEqual(reworkScore({ counts: {}, findings: [] }, []), { fixed: 0, left: 0 });
});

const before: Problems = { counts: { 'ui/a': 3, 'ui/b': 2, 'ui/c': 1 }, findings: [] };

test('before-problems fires only for rules that did not go down', () => {
  const after = [
    ...[1, 2, 3].map(() => finding('ui/a')),
    finding('ui/b'),
    ...[1, 2, 3].map(() => finding('ui/new')),
  ];
  const found = beforeProblemFindings(before, after);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.rule, 'ux/before-problems');
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message.params, { rule: 'ui/a' });
  assert.deepEqual(found[0]?.hint.params, { before: 3, after: 3 });
});

test('a rule that got worse fires with both counts', () => {
  const found = beforeProblemFindings(before, [finding('ui/c'), finding('ui/c')]);
  assert.deepEqual(found[0]?.hint.params, { before: 1, after: 2 });
});

test('reworkScore gives exact numbers', () => {
  const after = [finding('ui/a'), finding('ui/b'), finding('ui/b'), finding('ui/b')];
  // a: 3 -> 1 (fixed 2, left 1); b: 2 -> 3 (fixed 0, left 2); c: 1 -> 0 (fixed 1, left 0)
  assert.deepEqual(reworkScore(before, after), { fixed: 3, left: 3 });
});
