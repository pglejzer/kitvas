import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IMAGE_FILE,
  imageOfUrl,
  imageUrl,
  KEYWORDS,
  KIND,
  keywordOfProp,
  keywordOfWord,
  keywordsOf,
  plainValue,
  propKeywords,
  propValueOf,
} from '../../../client/studio/edit/props-kinds.ts';
import * as server from '../../../src/edit/index.ts';

const STACK_ALIGN = { type: 'enum', values: ['start', 'center', 'end', 'stretch'] };
const STACK_JUSTIFY = { type: 'enum', values: ['start', 'center', 'end', 'between'] };
const STACK_DIRECTION = { type: 'enum', values: ['column', 'row'], default: 'column' };
const STACK_WRAP = { type: 'boolean', default: false };

test('the client copies of the kinds and the keyword lists equal the server ones', () => {
  assert.deepEqual(KIND, server.PROPERTY_KIND);
  assert.deepEqual(KEYWORDS, server.STYLE_KEYWORDS);
  assert.equal(IMAGE_FILE.source, server.IMAGE_FILE.source);
  assert.equal(IMAGE_FILE.flags, server.IMAGE_FILE.flags);
  for (const property of server.STYLE_PROPERTIES) {
    assert.deepEqual(keywordsOf(property), server.keywordsOf(property), property);
  }
});

test('the client reads image addresses and kit words as the server does', () => {
  const addresses = [
    'url(../img/hero.png)',
    ' url(../img/a-b_c.webp) ',
    'url(../img/sub/a.png)',
    'url("../img/a.png")',
    'url(https://x.test/a.png)',
    'none',
  ];
  for (const css of addresses) assert.equal(imageOfUrl(css), server.imageOfUrl(css), css);
  assert.equal(imageUrl('a.png'), server.imageUrl('a.png'));
  assert.deepEqual(plainValue('flex'), server.plainValue('flex'));
  const words = ['start', 'end', 'between', 'around', 'evenly', 'center', 'row', 'left', 'x'];
  for (const property of server.STYLE_PROPERTIES) {
    if (!server.isKeywordProperty(property)) continue;
    for (const word of words) {
      assert.equal(
        keywordOfWord(property, word),
        server.keywordOfWord(property, word),
        `${property} ${word}`,
      );
    }
  }
});

test("a keyword says itself on Stack's props in the kit's own words", () => {
  assert.deepEqual(propValueOf('align-items', STACK_ALIGN, 'flex-start'), {
    kind: 'string',
    value: 'start',
  });
  assert.deepEqual(propValueOf('justify-content', STACK_JUSTIFY, 'space-between'), {
    kind: 'string',
    value: 'between',
  });
  assert.deepEqual(propValueOf('flex-direction', STACK_DIRECTION, 'row'), {
    kind: 'string',
    value: 'row',
  });
  // Stack cannot say a reversed row, nor `baseline`.
  assert.equal(propValueOf('flex-direction', STACK_DIRECTION, 'row-reverse'), null);
  assert.equal(propValueOf('align-items', STACK_ALIGN, 'baseline'), null);
  assert.deepEqual(propValueOf('flex-wrap', STACK_WRAP, 'wrap'), { kind: 'boolean', value: true });
  assert.deepEqual(propValueOf('flex-wrap', STACK_WRAP, 'nowrap'), {
    kind: 'boolean',
    value: false,
  });
  // A boolean says nothing about any other property.
  assert.equal(propValueOf('display', STACK_WRAP, 'flex'), null);
});

test("a covering prop's value reads as its keyword; its row offers what it can say", () => {
  assert.equal(keywordOfProp('justify-content', STACK_JUSTIFY, 'between'), 'space-between');
  assert.equal(keywordOfProp('align-items', STACK_ALIGN, 'stretch'), 'stretch');
  assert.equal(keywordOfProp('align-items', STACK_ALIGN, undefined), null);
  assert.equal(keywordOfProp('flex-wrap', STACK_WRAP, true), 'wrap');
  assert.equal(keywordOfProp('flex-wrap', STACK_WRAP, false), 'nowrap');
  assert.equal(keywordOfProp('flex-wrap', STACK_WRAP, undefined), 'nowrap');
  assert.deepEqual(propKeywords('align-items', STACK_ALIGN), [
    'stretch',
    'flex-start',
    'center',
    'flex-end',
  ]);
  assert.deepEqual(propKeywords('justify-content', STACK_JUSTIFY), [
    'flex-start',
    'center',
    'flex-end',
    'space-between',
  ]);
  assert.deepEqual(propKeywords('flex-direction', STACK_DIRECTION), ['row', 'column']);
  assert.deepEqual(propKeywords('flex-wrap', STACK_WRAP), ['nowrap', 'wrap']);
  assert.deepEqual(propKeywords('gap', STACK_ALIGN), []);
});
