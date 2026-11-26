import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkFragment,
  FRAGMENT_BYTES_MAX,
  FRAGMENT_COUNT_MAX,
  type Fragment,
  fragmentListing,
  mergeFragments,
  repeatedComponentNames,
} from '../../src/kit/index.ts';
import type { Json } from './helpers/project-kit.ts';

/** A component entry as a learner writes it: only what the contract needs. */
const component = (name: string, extra: Json = {}): Json => ({
  name,
  category: 'display',
  description: `${name} of the test kit.`,
  import: { from: '@acme/ui', name },
  props: [],
  ...extra,
});

const text = (value: unknown): string => JSON.stringify(value, null, 2);

/** A fragment that passed the checks. */
function fragment(name: string, value: Json): Fragment {
  const checked = checkFragment(name, text(value));
  assert.ok(checked.ok, `fragment ${name} should pass`);
  return checked.fragment;
}

/** Each issue of a check as its place and its message key. */
const at = (checked: ReturnType<typeof checkFragment>): string[][] =>
  checked.ok ? [] : checked.issues.map((issue) => [issue.path, issue.key]);

test('the listing names the fragments in order and reports what is no fragment', () => {
  const read = fragmentListing({
    files: [
      { name: 'Inputs.json', size: 10 },
      { name: 'display.json', size: 10 },
      { name: 'inputs.json', size: 10 },
      { name: 'notes.txt', size: 10 },
    ],
    other: ['nested'],
  });
  assert.deepEqual(read.names, ['display', 'inputs']);
  const stray = read.issues.map((issue) => [issue.fragment, issue.key, issue.params.file]);
  assert.deepEqual(stray, [
    ['', 'kitIssue.fragmentFile', 'nested'],
    ['', 'kitIssue.fragmentFile', 'Inputs.json'],
    ['', 'kitIssue.fragmentFile', 'notes.txt'],
  ]);
});

test('a fragment over 2 MiB is not read; more than 20 fragments are none read', () => {
  const big = fragmentListing({
    files: [
      { name: 'big.json', size: FRAGMENT_BYTES_MAX + 1 },
      { name: 'small.json', size: FRAGMENT_BYTES_MAX },
    ],
    other: [],
  });
  assert.deepEqual(big.names, ['small']);
  assert.deepEqual(big.issues, [
    {
      fragment: 'big',
      path: '',
      key: 'kitIssue.fragmentTooLarge',
      params: { size: FRAGMENT_BYTES_MAX + 1, max: FRAGMENT_BYTES_MAX },
    },
  ]);

  const files = Array.from({ length: FRAGMENT_COUNT_MAX + 1 }, (_, index) => ({
    name: `part-${index}.json`,
    size: 2,
  }));
  const many = fragmentListing({ files, other: [] });
  assert.deepEqual(many.names, []);
  assert.deepEqual(many.issues, [
    {
      fragment: '',
      path: '',
      key: 'kitIssue.fragmentsTooMany',
      params: { count: FRAGMENT_COUNT_MAX + 1, max: FRAGMENT_COUNT_MAX },
    },
  ]);
  const twenty = fragmentListing({ files: files.slice(0, FRAGMENT_COUNT_MAX), other: [] });
  assert.equal(twenty.names.length, 20);
});

test('a fragment that is not JSON says why', () => {
  const checked = checkFragment('inputs', '{ "components": [ }');
  assert.equal(checked.ok, false);
  assert.deepEqual(at(checked), [['', 'kitIssue.fragmentNotJson']]);
  assert.ok(!checked.ok && typeof checked.issues[0]?.params.detail === 'string');
});

test('a fragment holds components and gaps only, components always', () => {
  assert.deepEqual(at(checkFragment('a', text({ components: [], note: 'x' }))), [
    ['', 'kitIssue.fragmentContract'],
  ]);
  const unknown = checkFragment('a', text({ components: [], note: 'x' }));
  assert.ok(!unknown.ok);
  assert.match(String(unknown.issues[0]?.params.text), /Unrecognized key/);
  assert.deepEqual(at(checkFragment('a', text({ gaps: [] }))), [
    ['components', 'kitIssue.fragmentContract'],
  ]);
  assert.deepEqual(at(checkFragment('a', '[]')), [['', 'kitIssue.fragmentContract']]);
  // Gaps may be left out, and a fragment may hold no component.
  assert.equal(checkFragment('a', text({ components: [] })).ok, true);
});

test('every component and gap is held to the contract, each issue at its place', () => {
  const checked = checkFragment(
    'inputs',
    text({
      components: [
        component('Button'),
        component('Card', {
          examples: [{ code: '<Card />', imports: ['Card'] }],
          state: { value: 'open', onChange: 'onClose' },
        }),
      ],
      gaps: [{ path: 'Card.props.sx', reason: 'later' }],
    }),
  );
  assert.deepEqual(at(checked), [
    ['components.1.state', 'kitIssue.fragmentContract'],
    ['components.1.examples.0.title', 'kitIssue.fragmentContract'],
    ['gaps.0.reason', 'kitIssue.fragmentContract'],
  ]);
  assert.ok(!checked.ok);
  assert.equal(checked.issues[0]?.fragment, 'inputs');
  assert.match(String(checked.issues[1]?.params.text), /expected string/);
});

test('a fragment that passes keeps its entries as written, without the contract defaults', () => {
  const written = component('Button', {
    examples: [{ title: 'Save', code: '<Button />', imports: ['Button'] }],
  });
  const passed = fragment('actions', {
    components: [written],
    gaps: [{ path: 'Button.props.sx', reason: 'unsupported' }],
  });
  assert.deepEqual(passed, {
    name: 'actions',
    components: [{ name: 'Button', entry: written }],
    gaps: [
      {
        path: 'Button.props.sx',
        entry: { path: 'Button.props.sx', reason: 'unsupported' },
      },
    ],
  });
  // A byte order mark in front of the JSON is no problem.
  const mark = String.fromCharCode(0xfeff);
  assert.equal(checkFragment('actions', `${mark}${text({ components: [] })}`).ok, true);
});

test('a name twice, in two fragments or in one, is reported at each later place', () => {
  const first = fragment('actions', { components: [component('Button'), component('Link')] });
  const second = fragment('inputs', {
    components: [component('Field'), component('Button'), component('Field')],
  });
  assert.deepEqual(repeatedComponentNames([first, second]), [
    {
      fragment: 'inputs',
      path: 'components.1.name',
      key: 'kitIssue.fragmentNameTwice',
      params: { name: 'Button', other: 'actions' },
    },
    {
      fragment: 'inputs',
      path: 'components.2.name',
      key: 'kitIssue.fragmentNameTwice',
      params: { name: 'Field', other: 'inputs' },
    },
  ]);
  assert.deepEqual(repeatedComponentNames([first]), []);
});

test('merging replaces a component in place, adds new ones at the end, keeps every other key', () => {
  const kitJson: Json = {
    schemaVersion: 1,
    id: 'acme',
    tokens: { file: 'json/tokens.json' },
    components: [component('Button'), component('Card')],
  };
  const newButton = component('Button', { description: 'A better button.' });
  const merged = mergeFragments(kitJson, [
    fragment('actions', { components: [newButton, component('Link')] }),
    fragment('inputs', { components: [component('Field')] }),
  ]);
  assert.deepEqual(merged.added, ['Link', 'Field']);
  assert.deepEqual(merged.replaced, ['Button']);
  assert.equal(merged.components, 4);
  assert.deepEqual(merged.json, {
    schemaVersion: 1,
    id: 'acme',
    tokens: { file: 'json/tokens.json' },
    components: [newButton, component('Card'), component('Link'), component('Field')],
  });
  // No gaps key without a gap to keep.
  assert.equal('gaps' in merged.json, false);
  assert.equal(merged.gaps, 0);
  // The kit.json given is not changed.
  assert.deepEqual(kitJson.components, [component('Button'), component('Card')]);
});

test('gaps are joined one a path, the fragment winning, and a gap now a component is dropped', () => {
  const kitJson: Json = {
    components: [component('Button')],
    gaps: [
      { path: 'Accordion', reason: 'missing' },
      { path: 'Button.props.sx', reason: 'unverified' },
      { path: 'Masonry', reason: 'unsupported' },
    ],
  };
  const merged = mergeFragments(kitJson, [
    fragment('surfaces', {
      components: [component('Accordion')],
      gaps: [
        { path: 'Button.props.sx', reason: 'unsupported' },
        { path: 'Accordion.props.slots', reason: 'unverified' },
      ],
    }),
  ]);
  assert.deepEqual(merged.json.gaps, [
    { path: 'Button.props.sx', reason: 'unsupported' },
    { path: 'Masonry', reason: 'unsupported' },
    { path: 'Accordion.props.slots', reason: 'unverified' },
  ]);
  assert.equal(merged.gaps, 3);
  assert.deepEqual(merged.added, ['Accordion']);
});
