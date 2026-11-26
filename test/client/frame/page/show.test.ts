import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChoices } from '../../../../client/frame/page/options.ts';
import { createShow } from '../../../../client/frame/page/show.ts';
import {
  choiceFromQuery,
  type DraftOption,
  type OptionChoice,
} from '../../../../src/shared/values/options.ts';

const COLUMNS: DraftOption = {
  id: 'columns',
  label: 'Columns',
  default: '3',
  values: [
    { id: '3', label: 'Three' },
    { id: '2', label: 'Two' },
  ],
};
const CARDS: DraftOption = {
  id: 'cards',
  label: 'Cards',
  default: 'outlined',
  values: [
    { id: 'outlined', label: 'Outlined' },
    { id: 'filled', label: 'Filled' },
  ],
};

/** A root that keeps its attributes in a map. */
function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  };
}

/** A frame page: states, options, and a log of what the render, the followers and the studio got. */
function page(options: DraftOption[], search = '') {
  const root = fakeRoot();
  const choices = createChoices(
    root,
    options,
    choiceFromQuery(options, new URLSearchParams(search)),
  );
  const log: string[] = [];
  let states = ['filled', 'empty'];
  const show = createShow({
    choices,
    states: () => states,
    initial: 'filled',
    change: (render) => {
      log.push('change');
      render();
      return Promise.resolve();
    },
    render: (state, choice) => log.push(`render ${state} ${JSON.stringify(choice)}`),
    changed: (state) => log.push(`followers ${state}`),
    answer: (state, choice) => log.push(`shown ${state} ${JSON.stringify(choice)}`),
  });
  return {
    root,
    choices,
    show,
    log,
    setStates: (next: string[]) => {
      states = next;
    },
  };
}

test('the root carries one attribute per option before the first render', () => {
  const none = page([]);
  assert.equal(none.root.attributes.size, 0);
  assert.deepEqual(none.choices.get(), {});

  const asked = page([COLUMNS, CARDS], 'opt-columns=2&opt-cards=nope&opt-other=x');
  assert.deepEqual(asked.choices.get(), { columns: '2', cards: 'outlined' });
  assert.deepEqual(
    [...asked.root.attributes],
    [
      ['data-opt-columns', '2'],
      ['data-opt-cards', 'outlined'],
    ],
  );
});

test('options switch in place: the render, the followers, then the answer carries the choice', () => {
  const view = page([COLUMNS, CARDS]);
  view.show.show('filled', { columns: '2' });
  assert.deepEqual(view.log, [
    'change',
    'render filled {"columns":"2","cards":"outlined"}',
    'followers filled',
    'shown filled {"columns":"2","cards":"outlined"}',
  ]);
  assert.equal(view.root.attributes.get('data-opt-columns'), '2');
});

test('a state switch keeps the choice, and an option switch keeps the state', () => {
  const view = page([COLUMNS], 'opt-columns=2');
  view.show.show('empty');
  assert.equal(view.show.current(), 'empty');
  assert.deepEqual(view.choices.get(), { columns: '2' });
  view.show.show(view.show.current(), { columns: '3' });
  assert.equal(view.show.current(), 'empty');
  assert.equal(view.root.attributes.get('data-opt-columns'), '3');
});

test('a choice equal to the one shown renders nothing and still answers shown', () => {
  const view = page([COLUMNS]);
  view.show.show('filled', { columns: '3' });
  assert.deepEqual(view.log, ['shown filled {"columns":"3"}']);
  view.show.show('filled');
  assert.equal(view.log.length, 2);
});

test('an unknown id or value in what the studio asks is dropped or becomes the default', () => {
  const view = page([COLUMNS]);
  view.show.show('filled', { columns: '9', other: 'x' });
  assert.deepEqual(view.choices.get(), { columns: '3' });
  view.show.show('filled', { columns: '2' });
  view.show.show('filled', { columns: '9' });
  assert.deepEqual(view.choices.get(), { columns: '3' });
});

test('a state the build does not have is ignored and gets no answer', () => {
  const view = page([COLUMNS]);
  view.show.show('missing', { columns: '2' });
  assert.deepEqual(view.log, []);
  assert.deepEqual(view.choices.get(), { columns: '3' });
});

test('a build taken in that lost an option shows its own defaults', () => {
  const view = page([COLUMNS, CARDS]);
  view.show.show('filled', { columns: '2', cards: 'filled' });
  // The new build keeps `columns` (without the value 2) and has no `cards`.
  const next: DraftOption = {
    ...COLUMNS,
    values: [
      { id: '3', label: 'Three' },
      { id: '4', label: 'Four' },
    ],
  };
  const choice: OptionChoice = view.choices.swap([next]);
  assert.deepEqual(choice, { columns: '3' });
  assert.equal(view.root.attributes.get('data-opt-columns'), '3');
  assert.equal(view.root.attributes.has('data-opt-cards'), false);

  // A build that keeps both values shows the choice as it was.
  const same = page([COLUMNS]);
  same.show.show('filled', { columns: '2' });
  assert.deepEqual(same.choices.swap([COLUMNS]), { columns: '2' });
});

test('a new build with other states resets the state it shows', () => {
  const view = page([]);
  view.show.show('empty');
  view.setStates(['filled']);
  view.show.reset('filled');
  assert.equal(view.show.current(), 'filled');
});
