import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KEYWORD_ICONS,
  keywordIcon,
  segmentIcons,
} from '../../../../../../client/studio/edit/props/controls/keyword-icons.ts';
import { keywordsOf } from '../../../../../../client/studio/edit/props/values/kinds.ts';
import { STYLE_PROPERTIES } from '../../../../../../src/edit/index.ts';
import { ICON_NAMES } from '../../../../../../src/studio/pages/icons/paths.ts';

test('a direction is an arrow the way the items run', () => {
  assert.equal(keywordIcon('flex-direction', 'row'), 'arrow-right');
  assert.equal(keywordIcon('flex-direction', 'column'), 'arrow-down');
  assert.equal(keywordIcon('flex-direction', 'column-reverse'), 'arrow-up');
  // No arrow points left yet: the chevron stands in for it.
  assert.equal(keywordIcon('flex-direction', 'row-reverse'), 'arrow-left');
});

test('an alignment is bars against a line, at the start, the centre, the end or stretched', () => {
  for (const property of ['align-items', 'align-self', 'justify-content'] as const) {
    assert.equal(keywordIcon(property, 'flex-start'), 'align-start', property);
    assert.equal(keywordIcon(property, 'center'), 'align-center', property);
    assert.equal(keywordIcon(property, 'flex-end'), 'align-end', property);
  }
  assert.equal(keywordIcon('align-items', 'stretch'), 'align-stretch');
  assert.equal(keywordIcon('justify-content', 'space-between'), 'align-between');
  assert.equal(keywordIcon('align-self', 'stretch'), 'align-stretch');
  assert.equal(keywordIcon('text-align', 'left'), 'align-start');
  assert.equal(keywordIcon('text-align', 'center'), 'align-center');
  assert.equal(keywordIcon('text-align', 'right'), 'align-end');
  assert.equal(keywordIcon('text-align', 'justify'), 'align-stretch');
});

test('a keyword without a drawing, or a property without any, has no icon', () => {
  assert.equal(keywordIcon('align-items', 'baseline'), null);
  assert.equal(keywordIcon('justify-content', 'space-around'), null);
  assert.equal(keywordIcon('align-items', 'space-between'), null);
  assert.equal(keywordIcon('align-self', 'auto'), null);
  assert.equal(keywordIcon('border-style', 'solid'), null);
  assert.equal(keywordIcon('flex-wrap', 'wrap'), null);
  assert.equal(keywordIcon('flex-direction', 'toString'), null);
});

test('a row of keywords is icons only when every keyword in it has one', () => {
  assert.deepEqual(segmentIcons('flex-direction', keywordsOf('flex-direction') ?? []), [
    'arrow-right',
    'arrow-left',
    'arrow-down',
    'arrow-up',
  ]);
  // A covering prop's words, as Base's Stack offers them.
  const stack = segmentIcons('flex-direction', ['row', 'column']);
  assert.deepEqual(stack, ['arrow-right', 'arrow-down']);
  assert.deepEqual(segmentIcons('align-items', ['stretch', 'flex-start', 'center', 'flex-end']), [
    'align-stretch',
    'align-start',
    'align-center',
    'align-end',
  ]);
  assert.deepEqual(segmentIcons('text-align', keywordsOf('text-align') ?? []), [
    'align-start',
    'align-center',
    'align-end',
    'align-stretch',
  ]);
  assert.deepEqual(
    segmentIcons('justify-content', ['flex-start', 'center', 'flex-end', 'space-between']),
    ['align-start', 'align-center', 'align-end', 'align-between'],
  );
  // One word without a drawing: the whole row shows words, never a mix.
  const around = ['flex-start', 'center', 'space-around'];
  assert.equal(segmentIcons('justify-content', around), null);
  assert.equal(segmentIcons('border-style', keywordsOf('border-style') ?? []), null);
  assert.equal(segmentIcons('background-size', keywordsOf('background-size') ?? []), null);
  assert.equal(segmentIcons('flex-direction', []), null);
});

test('every icon of the table is drawn, and every keyword of it is one its property takes', () => {
  const drawn = new Set<string>(ICON_NAMES);
  let count = 0;
  for (const property of STYLE_PROPERTIES) {
    const icons = KEYWORD_ICONS[property];
    if (icons === undefined) continue;
    const words = keywordsOf(property) ?? [];
    for (const [keyword, name] of icons) {
      count += 1;
      assert.ok(drawn.has(name), `${property} ${keyword}: ${name} is an icon`);
      assert.ok(words.includes(keyword), `${property} takes ${keyword}`);
    }
  }
  assert.ok(count > 0);
});
