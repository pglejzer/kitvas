import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arrowTab,
  glyphBox,
  type IconSheet,
  POLL_MAX,
  type Previews,
  pollDecision,
  previewOf,
  previewState,
  readTab,
  shownTab,
  splitIcons,
  TAB_KEY,
  type TabStorage,
  writeTab,
} from '../../../../../client/studio/edit/insert/previews.ts';

const sheet: IconSheet = {
  src: '/icons.png',
  cell: 48,
  columns: 4,
  names: ['alert', 'check', 'chevron', 'close', 'minus', 'plus'],
};

function memory(initial: string | null): TabStorage & { value: string | null } {
  const store = {
    value: initial,
    getItem: () => store.value,
    setItem: (_key: string, value: string) => {
      store.value = value;
    },
  };
  return store;
}

test('an icon on the first row sits at its column, scaled to 24 px a cell', () => {
  assert.deepEqual(glyphBox(sheet, 'check'), { x: -24, y: -0, width: 96 });
});

test('an icon on the second row sits one scaled cell down and at its column', () => {
  assert.deepEqual(glyphBox(sheet, 'minus'), { x: -0, y: -24, width: 96 });
  assert.deepEqual(glyphBox(sheet, 'plus'), { x: -24, y: -24, width: 96 });
});

test('a name that is not on the sheet has no glyph box', () => {
  assert.equal(glyphBox(sheet, 'zap'), null);
});

test('with no sheet no icon has a glyph box', () => {
  assert.equal(glyphBox(null, 'check'), null);
});

test('names off the sheet fall back to chips and the order is kept', () => {
  const split = splitIcons(['plus', 'zap', 'alert', 'bolt'], sheet);
  assert.deepEqual(split.glyphs, ['plus', 'alert']);
  assert.deepEqual(split.chips, ['zap', 'bolt']);
});

test('with no sheet every icon is a chip', () => {
  const split = splitIcons(['plus', 'alert'], null);
  assert.deepEqual(split.glyphs, []);
  assert.deepEqual(split.chips, ['plus', 'alert']);
});

const previews = (state: Previews['state'], components: Record<string, string>): Previews => ({
  state,
  backdrop: null,
  components,
  icons: null,
});

test('a component with a preview address shows the image', () => {
  const made = previews('ready', { Input: '/p/input.png' });
  assert.equal(previewOf(made, 'Input'), '/p/input.png');
  assert.deepEqual(previewState(made, 'Input'), { kind: 'image', src: '/p/input.png' });
});

test('a component without a preview shows a skeleton while previews are made', () => {
  assert.deepEqual(previewState(previews('making', {}), 'Input'), { kind: 'making' });
});

test('a component without a preview is a compact tile once previews are ready or none', () => {
  assert.deepEqual(previewState(previews('ready', {}), 'Input'), { kind: 'none' });
  assert.deepEqual(previewState(previews('none', {}), 'Input'), { kind: 'none' });
  assert.deepEqual(previewState(undefined, 'Input'), { kind: 'none' });
});

test('while previews are made the palette is asked again until the cap', () => {
  assert.equal(pollDecision('making', 0), 'again');
  assert.equal(pollDecision('making', POLL_MAX - 1), 'again');
  assert.equal(pollDecision('making', POLL_MAX), 'stop');
});

test('ready or none previews stop the asking', () => {
  assert.equal(pollDecision('ready', 0), 'stop');
  assert.equal(pollDecision('none', 3), 'stop');
  assert.equal(pollDecision(undefined, 0), 'stop');
});

test('with nothing stored the Components tab shows', () => {
  assert.equal(readTab(memory(null)), 'components');
  assert.equal(readTab(null), 'components');
});

test('junk or throwing storage opens on Components', () => {
  assert.equal(readTab(memory('nonsense')), 'components');
  assert.equal(readTab(memory('{"a":1}')), 'components');
  const throwing: TabStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(readTab(throwing), 'components');
  assert.doesNotThrow(() => writeTab(throwing, 'icons'));
});

test('the picked tab is kept for the browser tab and read back', () => {
  const storage = memory(null);
  writeTab(storage, 'icons');
  assert.equal(storage.value, 'icons');
  assert.equal(TAB_KEY, 'kitvas.insert.tab');
  assert.equal(readTab(storage), 'icons');
});

const counts = (components: number, sections: number, icons: number) => ({
  components,
  sections,
  icons,
});

test('without a search the picked tab shows whatever it holds', () => {
  assert.equal(shownTab('sections', counts(3, 0, 2), false), 'sections');
});

test('a search keeps the picked tab when it has hits', () => {
  assert.equal(shownTab('icons', counts(3, 1, 2), true), 'icons');
});

test('a search moves to the first tab with hits only when the picked tab has none', () => {
  assert.equal(shownTab('components', counts(0, 0, 2), true), 'icons');
  assert.equal(shownTab('icons', counts(0, 4, 0), true), 'sections');
});

test('a search with no hit anywhere leaves the picked tab', () => {
  assert.equal(shownTab('sections', counts(0, 0, 0), true), 'sections');
});

test('the Images tab is not moved away by a search', () => {
  assert.equal(shownTab('images', counts(0, 0, 0), true), 'images');
});

test('arrow keys move between tabs and wrap round', () => {
  assert.equal(arrowTab('components', 'ArrowRight'), 'sections');
  assert.equal(arrowTab('images', 'ArrowRight'), 'components');
  assert.equal(arrowTab('components', 'ArrowLeft'), 'images');
  assert.equal(arrowTab('sections', 'Home'), 'components');
  assert.equal(arrowTab('sections', 'End'), 'images');
  assert.equal(arrowTab('sections', 'a'), null);
});
