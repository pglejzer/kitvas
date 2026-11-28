import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FactNode, FieldFacts, RawFinding } from '../../../src/checks/index.ts';
import { STATE_RULES, VISIT_RULES } from '../../../src/checks/index.ts';
import { node, page, states, visit } from './facts.ts';

const FIELD: FieldFacts = {
  control: 'input',
  type: 'text',
  name: 'full_name',
  value: '',
  placeholder: '',
  required: false,
  invalid: false,
  autocomplete: '',
  label: 'visible',
  labelText: 'Full name',
  labelBox: [0, 0, 100, 20],
  described: [],
  group: -1,
  groupName: '',
  form: -1,
  mark: null,
};

/** An input node with its field facts; the box is 200 × 40 at y. */
function input(field: Partial<FieldFacts> = {}, part: Partial<FactNode> = {}, y = 30): FactNode {
  return node({ tag: 'input', box: [0, y, 200, 40], field: { ...FIELD, ...field }, ...part });
}

function run(id: string, ...args: Parameters<typeof visit>): RawFinding[] {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, id);
  return rule.run(visit(...args));
}

const message = (key: string, params: Record<string, string | number>) => ({
  key: `checkRule.${key}`,
  params,
});
const hint = (key: string, params: Record<string, string | number> = {}) => ({
  key: `checkHint.${key}`,
  params,
});

test('every ux forms rule returns nothing for an empty page', () => {
  const empty = page([]);
  for (const id of [
    'ux/visible-label',
    'ux/fieldset',
    'ux/required-marks',
    'ux/label-position',
    'ux/single-column',
    'ux/field-count',
    'ux/input-type',
    'ux/submit',
    'ux/error-wording',
    'ux/broken-anchor',
  ]) {
    assert.deepEqual(run(id, empty, { screen: 'checkout' }), [], id);
  }
  const keeps = STATE_RULES.find((entry) => entry.id === 'ux/keeps-input');
  assert.ok(keeps);
  assert.deepEqual(keeps.run(states(visit(empty), [visit(empty, { stateKind: 'error' })])), []);
});

test('visible-label fixes a field named only by a placeholder', () => {
  const facts = page([input({ label: 'placeholder', labelText: '', placeholder: 'Your name' })]);
  assert.deepEqual(run('ux/visible-label', facts), [
    {
      check: 'ux',
      rule: 'ux/visible-label',
      severity: 'fix',
      file: null,
      line: 0,
      column: 0,
      element: null,
      message: message('uxVisibleLabel', { field: 'Your name', how: 'placeholder' }),
      hint: hint('uxVisibleLabel'),
      states: ['filled'],
      widths: [390],
    },
  ]);
});

test('visible-label gives review for a search field with a hidden label', () => {
  const facts = page([
    input({ type: 'search', label: 'hidden', labelText: 'Search orders', labelBox: null }),
    input({ label: 'aria', labelText: 'Search', type: 'text' }, {}, 100),
  ]);
  const found = run('ux/visible-label', facts);
  assert.equal(found.length, 2);
  assert.ok(found.every((finding) => finding.severity === 'review'));
});

test('visible-label is silent for a visible label and for buttons', () => {
  const facts = page([input(), input({ type: 'submit', label: 'none', labelText: '' }, {}, 80)]);
  assert.deepEqual(run('ux/visible-label', facts), []);
});

test('fieldset fixes a radio set with no group name, once per name', () => {
  const facts = page([
    input({ type: 'radio', name: 'plan', labelText: 'Free' }),
    input({ type: 'radio', name: 'plan', labelText: 'Pro' }, {}, 80),
  ]);
  const found = run('ux/fieldset', facts);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'fix');
  assert.deepEqual(found[0]?.message, message('uxFieldset', { name: 'plan' }));
  assert.deepEqual(found[0]?.hint, hint('uxFieldset'));
});

test('fieldset is silent when the group has a name, and for a lone radio', () => {
  const grouped = page([
    input({ type: 'radio', name: 'plan', group: 0, groupName: 'Plan' }),
    input({ type: 'radio', name: 'plan', group: 0, groupName: 'Plan' }, {}, 80),
  ]);
  assert.deepEqual(run('ux/fieldset', grouped), []);
  assert.deepEqual(run('ux/fieldset', page([input({ type: 'checkbox', name: 'tos' })])), []);
});

test('required-marks reviews uneven marks in one form', () => {
  const facts = page([
    node({ tag: 'form' }),
    input({ required: true, mark: 'required', form: 0 }),
    input({ required: true, mark: null, labelText: 'Email', name: 'email_x', form: 0 }, {}, 80),
  ]);
  const found = run('ux/required-marks', facts);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, message('uxRequiredMarks', { field: 'Email' }));
});

test('required-marks reviews required and optional marks used together', () => {
  const facts = page([
    input({ required: true, mark: 'required' }),
    input({ mark: 'optional', labelText: 'Phone' }, {}, 80),
  ]);
  assert.equal(run('ux/required-marks', facts).length, 1);
});

test('required-marks is silent for consistent forms and separate forms', () => {
  const consistent = page([
    input({ required: true, mark: 'required' }),
    input({ required: true, mark: 'required' }, {}, 80),
    input({ mark: null }, {}, 130),
  ]);
  assert.deepEqual(run('ux/required-marks', consistent), []);
  const separate = page([
    input({ required: true, mark: 'required', form: 0 }),
    input({ required: true, mark: null, form: 5 }, {}, 80),
  ]);
  assert.deepEqual(run('ux/required-marks', separate), []);
});

test('label-position reviews a label beside the field at 390 only', () => {
  const beside = input({ labelBox: [0, 40, 80, 20] }, {}, 30);
  const facts = page([beside]);
  const found = run('ux/label-position', facts);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, message('uxLabelPosition', { field: 'Full name' }));
  const wide = page([beside], { viewport: [1280, 800] });
  assert.deepEqual(run('ux/label-position', wide), []);
});

test('label-position is silent for a label above, a checkbox and a wrapping label', () => {
  const above = input({ labelBox: [0, 0, 100, 24] }, {}, 30);
  const checkbox = input({ type: 'checkbox', labelBox: [30, 100, 80, 20] }, {}, 100);
  const wrapping = input({ labelBox: [0, 150, 300, 80] }, {}, 160);
  assert.deepEqual(run('ux/label-position', page([above, checkbox, wrapping])), []);
});

test('single-column reviews two text fields on one row at 390', () => {
  const a = input({}, { box: [0, 100, 150, 40] });
  const b = input({ name: 'last', labelText: 'Last name' }, { box: [160, 100, 150, 40] });
  const found = run('ux/single-column', page([a, b]));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, message('uxSingleColumn', { field: 'Last name' }));
  assert.deepEqual(run('ux/single-column', page([a, b], { viewport: [1280, 800] })), []);
});

test('single-column is silent for stacked fields and a checkbox beside a field', () => {
  const stacked = page([input({}, {}, 0), input({}, {}, 60)]);
  assert.deepEqual(run('ux/single-column', stacked), []);
  const mixed = page([
    input({}, { box: [0, 100, 150, 40] }),
    input({ type: 'checkbox' }, { box: [160, 100, 20, 20] }),
  ]);
  assert.deepEqual(run('ux/single-column', mixed), []);
});

function many(count: number, part: Partial<FieldFacts> = {}): FactNode[] {
  return Array.from({ length: count }, (_, at) =>
    input({ name: `f${at}`, labelText: `Field ${at}`, ...part }, {}, at * 50),
  );
}

test('field-count reviews more than 8 fields on a checkout screen', () => {
  const found = run('ux/field-count', page(many(9)), { screen: 'checkout' });
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, message('uxFieldCount', { count: 9 }));
  assert.deepEqual(found[0]?.hint, hint('uxFieldCount', { max: 8 }));
});

test('field-count counts a radio group once and skips hidden fields', () => {
  const radios = [0, 1, 2].map((at) => input({ type: 'radio', name: 'plan' }, {}, at * 50));
  const facts = page([
    ...many(7),
    ...radios,
    input({ name: 'ghost' }, { hidden: true }, 500),
    input({ type: 'hidden', name: 'csrf' }, {}, 600),
  ]);
  assert.deepEqual(run('ux/field-count', facts, { screen: 'sign-up' }), []);
});

test('field-count is silent with no screen line and on other screens', () => {
  assert.deepEqual(run('ux/field-count', page(many(12))), []);
  assert.deepEqual(run('ux/field-count', page(many(12)), { screen: 'dashboard' }), []);
});

test('input-type reviews contact fields typed as text and non-quantity numbers', () => {
  const facts = page([
    input({ name: 'user_email', labelText: 'Email address' }),
    input({ name: 'zip', labelText: 'Postcode', type: 'number' }, {}, 80),
  ]);
  const found = run('ux/input-type', facts);
  assert.equal(found.length, 2);
  assert.deepEqual(
    found[0]?.message,
    message('uxInputType', { field: 'Email address', type: 'text' }),
  );
  assert.deepEqual(found[0]?.hint, hint('uxInputType', { suggest: 'email' }));
  assert.deepEqual(found[1]?.hint, hint('uxInputType', { suggest: 'text' }));
});

test('input-type is silent for the right type, quantities and look-alike words', () => {
  const facts = page([
    input({ type: 'email', labelText: 'Email' }),
    input({ type: 'number', labelText: 'Quantity', name: 'qty' }, {}, 80),
    input({ type: 'text', labelText: 'Country', name: 'country' }, {}, 130),
    input({ type: 'text', labelText: 'Hotel', name: 'hotel' }, {}, 180),
  ]);
  assert.deepEqual(run('ux/input-type', facts), []);
});

test('submit reviews a form with fields and no submit button', () => {
  const facts = page([
    node({ tag: 'form', box: [0, 0, 300, 300] }),
    input({ form: 0 }, { parent: 0 }),
    node({ tag: 'button', parent: 0, action: action({ submit: false }) }),
  ]);
  const found = run('ux/submit', facts);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(found[0]?.message, message('uxSubmit', {}));
});

test('submit is silent with a nested submit button, and for a form with no fields', () => {
  const facts = page([
    node({ tag: 'form' }),
    node({ tag: 'div', parent: 0 }),
    input({ form: 0 }, { parent: 1 }),
    node({ tag: 'button', parent: 1, action: action({ submit: true }) }),
  ]);
  assert.deepEqual(run('ux/submit', facts), []);
  assert.deepEqual(run('ux/submit', page([node({ tag: 'form' })])), []);
});

function action(
  part: Partial<NonNullable<FactNode['action']>> = {},
): NonNullable<FactNode['action']> {
  return {
    kind: 'button',
    name: 'Send',
    text: 'Send',
    href: null,
    submit: false,
    disabled: false,
    menu: false,
    current: null,
    lines: 1,
    ...part,
  };
}

function described(text: string): FieldFacts['described'] {
  return [{ text, box: null, errorMessage: true }];
}

test('error-wording reviews a one-word or short message in an error state', () => {
  const facts = page([
    input({ invalid: true, described: described('Invalid.') }),
    input({ invalid: true, described: described('Error: Wrong email') }, {}, 80),
  ]);
  const found = run('ux/error-wording', facts, { stateKind: 'error', seen: { state: 'error' } });
  assert.equal(found.length, 2);
  assert.equal(found[0]?.severity, 'review');
  assert.deepEqual(
    found[0]?.message,
    message('uxErrorWording', { field: 'Full name', text: 'Invalid.' }),
  );
  assert.deepEqual(found[0]?.states, ['error']);
});

test('error-wording is silent for a specific message, outside error states, and valid fields', () => {
  const specific = page([
    input({ invalid: true, described: described('Enter your full name as on your card') }),
  ]);
  assert.deepEqual(run('ux/error-wording', specific, { stateKind: 'error' }), []);
  const vague = page([input({ invalid: true, described: described('Required') })]);
  assert.deepEqual(run('ux/error-wording', vague), []);
  const valid = page([input({ invalid: false, described: described('Required') })]);
  assert.deepEqual(run('ux/error-wording', valid, { stateKind: 'error' }), []);
});

test('broken-anchor fixes a link to an id that does not exist', () => {
  const link = node({ tag: 'a', action: action({ kind: 'link', href: '#email-error' }) });
  const found = run('ux/broken-anchor', page([link, node({ domId: 'name' })]));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'fix');
  assert.deepEqual(found[0]?.message, message('uxBrokenAnchor', { href: '#email-error' }));
  assert.deepEqual(found[0]?.hint, hint('uxBrokenAnchor', { target: 'email-error' }));
});

test('broken-anchor is silent for a present id, a bare hash, a hash route and other links', () => {
  const nodes = [
    node({ tag: 'a', action: action({ kind: 'link', href: '#email' }) }),
    node({ tag: 'a', action: action({ kind: 'link', href: '#' }) }),
    node({ tag: 'a', action: action({ kind: 'link', href: '/pricing' }) }),
    node({ tag: 'a', action: action({ kind: 'link', href: '#/settings' }) }),
    node({ tag: 'a', action: action({ kind: 'link', href: '#!/profile/jane' }) }),
    node({ domId: 'email' }),
  ];
  assert.deepEqual(run('ux/broken-anchor', page(nodes)), []);
});

const KS = 'sections/Form:Card/input';
const keeps = STATE_RULES.find((entry) => entry.id === 'ux/keeps-input');

function withValue(value: string, part: Partial<FieldFacts> = {}) {
  return page([input({ value, ...part }, { ks: KS })]);
}

test('keeps-input fixes a value lost in an error state', () => {
  assert.ok(keeps);
  const baseline = visit(withValue('Ada Lovelace'));
  const error = visit(withValue(''), { stateKind: 'error', seen: { state: 'error' } });
  const found = keeps.run(states(baseline, [error]));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.severity, 'fix');
  assert.equal(found[0]?.element, KS);
  assert.deepEqual(found[0]?.message, message('uxKeepsInput', { field: 'Full name' }));
  assert.deepEqual(found[0]?.states, ['error']);
});

test('keeps-input is silent for kept values, empty baselines, passwords and other states', () => {
  assert.ok(keeps);
  const baseline = visit(withValue('Ada'));
  const error = (value: string, part: Partial<FieldFacts> = {}) =>
    visit(withValue(value, part), { stateKind: 'error', seen: { state: 'error' } });
  assert.deepEqual(keeps.run(states(baseline, [error('Ada')])), []);
  assert.deepEqual(keeps.run(states(visit(withValue('')), [error('x')])), []);
  const secret = visit(withValue('hunter2', { type: 'password' }));
  assert.deepEqual(keeps.run(states(secret, [error('', { type: 'password' })])), []);
  const loading = visit(withValue(''), { stateKind: 'loading', seen: { state: 'loading' } });
  assert.deepEqual(keeps.run(states(baseline, [loading])), []);
});

test('a form with only a filled state and no screen line stays silent for field-count and error rules', () => {
  const facts = page(many(12, { invalid: true, described: described('Invalid') }));
  assert.deepEqual(run('ux/field-count', facts), []);
  assert.deepEqual(run('ux/error-wording', facts), []);
  assert.ok(keeps);
  assert.deepEqual(keeps.run(states(visit(facts), [])), []);
});
