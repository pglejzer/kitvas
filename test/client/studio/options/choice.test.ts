import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Frame } from '../../../../client/studio/frames.ts';
import {
  type ChoiceControl,
  createChoiceStore,
  laidOver,
  optionsAddress,
  sameChoice,
} from '../../../../client/studio/options/choice.ts';
import type { DraftOption, OptionChoice } from '../../../../src/shared/index.ts';

const OPTIONS: DraftOption[] = [
  {
    id: 'columns',
    label: 'Columns',
    default: '3',
    values: [
      { id: '3', label: '3' },
      { id: '2', label: '2' },
    ],
  },
  {
    id: 'cards',
    label: 'Cards',
    default: 'outlined',
    values: [
      { id: 'outlined', label: 'Outlined' },
      { id: 'filled', label: 'Filled' },
    ],
  },
];

const PAGE = 'http://kitvas.localhost:4000/drafts/shop?version=1&state=filled&width=1280';

const frameOf = (channel: string): Frame => ({
  role: 'current',
  channel,
  element: {} as unknown as HTMLIFrameElement,
  ready: true,
});

type Sent = { frame: Frame; choice: OptionChoice };

/** A store over two cards and an address held in a variable. */
function setup(initial: OptionChoice = {}, href = PAGE) {
  const frames = [frameOf('a'.repeat(20)), frameOf('b'.repeat(20))];
  const sent: Sent[] = [];
  const address = { href };
  const store: ChoiceControl = createChoiceStore({
    options: OPTIONS,
    initial,
    frames: () => frames,
    send: (frame, choice) => sent.push({ frame, choice }),
    address: {
      href: () => address.href,
      replace: (next) => {
        address.href = next;
      },
    },
  });
  return { store, frames, sent, address };
}

test('a switch posts once to every card, with the whole choice', () => {
  const { store, frames, sent } = setup();
  store.set({ columns: '2' });
  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent.map((one) => one.frame),
    frames,
  );
  assert.deepEqual(sent[0]?.choice, { columns: '2', cards: 'outlined' });
  assert.deepEqual(store.get(), { columns: '2', cards: 'outlined' });
});

test('a value the version does not have is not sent, nor an id it lacks', () => {
  const { store, sent, address } = setup();
  store.set({ columns: '9' });
  store.set({ size: 'big' });
  assert.equal(sent.length, 0);
  assert.deepEqual(store.get(), { columns: '3', cards: 'outlined' });
  assert.equal(address.href, PAGE);
});

test('the same values again are not sent again', () => {
  const { store, sent } = setup();
  store.set({ cards: 'filled' });
  store.set({ cards: 'filled' });
  assert.equal(sent.length, 2);
});

test('the address names the values that differ and none at the defaults', () => {
  const { store, address } = setup();
  store.set({ columns: '2' });
  assert.equal(address.href, `${PAGE}&opt-columns=2`);
  store.set({ cards: 'filled' });
  assert.equal(address.href, `${PAGE}&opt-columns=2&opt-cards=filled`);
  store.set({ columns: '3', cards: 'outlined' });
  assert.equal(address.href, PAGE);
});

test('the store starts from the address and drops what the version lacks', () => {
  const { store } = setup({ columns: '2', cards: 'glass', theme: 'dark' });
  assert.deepEqual(store.get(), { columns: '2', cards: 'outlined' });
});

test('listeners hear a change, once, and stop when they are told to', () => {
  const { store } = setup();
  const heard: OptionChoice[] = [];
  const stop = store.subscribe((choice) => heard.push(choice));
  store.set({ columns: '2' });
  store.set({ columns: '2' });
  stop();
  store.set({ columns: '3' });
  assert.deepEqual(heard, [{ columns: '2', cards: 'outlined' }]);
});

test('a frame that loaded again with other values is told the page values', () => {
  const { store, frames, sent } = setup();
  store.set({ columns: '2' });
  sent.length = 0;
  store.frameReady(frames[0] as Frame, { columns: '3', cards: 'outlined' });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]?.choice, { columns: '2', cards: 'outlined' });
  sent.length = 0;
  store.frameReady(frames[0] as Frame, { columns: '2', cards: 'outlined' });
  assert.equal(sent.length, 0);
});

test('a frame that shows other values than asked is followed, and a run of switches is not undone', () => {
  const { store, address } = setup();
  store.set({ columns: '2' });
  store.set({ cards: 'filled' });
  // The first answer is of the older switch: it changes nothing.
  store.frameShown({ columns: '2', cards: 'outlined' });
  assert.deepEqual(store.get(), { columns: '2', cards: 'filled' });
  // The last answer says what the frame shows: an older build kept three columns.
  store.frameShown({ columns: '3', cards: 'filled' });
  assert.deepEqual(store.get(), { columns: '3', cards: 'filled' });
  assert.equal(address.href, `${PAGE}&opt-cards=filled`);
  // An answer that names nothing (a build without options) changes nothing.
  store.set({ columns: '2' });
  store.frameShown({});
  assert.deepEqual(store.get(), { columns: '2', cards: 'filled' });
});

test('new defaults take the values shown out of the address', () => {
  const { store, address } = setup({ columns: '2' }, `${PAGE}&opt-columns=2`);
  assert.equal(address.href, `${PAGE}&opt-columns=2`);
  store.redefine({ columns: '2', cards: 'outlined' });
  assert.equal(address.href, PAGE);
  assert.deepEqual(store.get(), { columns: '2', cards: 'outlined' });
  assert.equal(store.options()[0]?.default, '2');
  store.set({ columns: '3' });
  assert.equal(address.href, `${PAGE}&opt-columns=3`);
});

test('the address keeps its other pairs, and replaces the old option pairs', () => {
  assert.equal(
    optionsAddress(`${PAGE}&view=1000&opt-columns=2&opt-gone=x`, OPTIONS, {
      columns: '3',
      cards: 'filled',
    }),
    `${PAGE}&view=1000&opt-cards=filled`,
  );
});

test('a choice laid over another keeps what it does not name', () => {
  assert.deepEqual(laidOver(OPTIONS, { columns: '2', cards: 'filled' }, { columns: '3' }), {
    columns: '3',
    cards: 'filled',
  });
  assert.equal(sameChoice(OPTIONS, { columns: '3' }, { cards: 'outlined' }), true);
  assert.equal(sameChoice(OPTIONS, { columns: '2' }, {}), false);
});
