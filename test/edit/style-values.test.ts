import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IMAGE_FILE,
  imageOfUrl,
  imageUrl,
  isKeywordProperty,
  keywordOfWord,
  keywordsOf,
  kindOf,
  PROPERTY_KIND,
  PROPERTY_TOKEN_TYPE,
  plainValue,
  STYLE_KEYWORDS,
  STYLE_PROPERTIES,
  type StyleValue,
  styleValueRefusal,
  tokenTypeOf,
} from '../../src/edit/index.ts';

const hasHero = (file: string): boolean => file === 'hero.png';

test('every style property has one kind: a token type, keyword or image', () => {
  assert.deepEqual(Object.keys(PROPERTY_KIND).sort(), [...STYLE_PROPERTIES].sort());
  for (const property of STYLE_PROPERTIES) {
    const kind = PROPERTY_KIND[property];
    const token = tokenTypeOf(property);
    if (kind === 'keyword') assert.ok(isKeywordProperty(property), property);
    else if (kind === 'image') assert.equal(property, 'background-image');
    else assert.equal(token, kind, property);
    assert.equal(kindOf(property), kind);
  }
  assert.equal(kindOf('outline-offset'), null);
  assert.equal(tokenTypeOf('display'), null);
  assert.equal(Object.keys(PROPERTY_TOKEN_TYPE).length + 11, STYLE_PROPERTIES.length);
});

test('the stage 4a properties keep their order and plan 15 adds the new ones after them', () => {
  assert.deepEqual(STYLE_PROPERTIES.slice(0, 3), ['padding', 'padding-block', 'padding-inline']);
  assert.equal(STYLE_PROPERTIES[16], 'height');
  assert.equal(STYLE_PROPERTIES.length, 38);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    assert.equal(PROPERTY_TOKEN_TYPE[`padding-${side}` as const], 'dimension');
    assert.equal(PROPERTY_TOKEN_TYPE[`margin-${side}` as const], 'dimension');
  }
  assert.equal(PROPERTY_TOKEN_TYPE['outline-color'], 'color');
  assert.equal(PROPERTY_TOKEN_TYPE['outline-width'], 'dimension');
});

test('the keyword lists are the fixed ones of the plan', () => {
  assert.deepEqual(STYLE_KEYWORDS, {
    display: ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none'],
    'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
    'flex-wrap': ['nowrap', 'wrap'],
    'justify-content': [
      'flex-start',
      'center',
      'flex-end',
      'space-between',
      'space-around',
      'space-evenly',
    ],
    'align-items': ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
    'align-self': ['auto', 'stretch', 'flex-start', 'center', 'flex-end'],
    'text-align': ['left', 'center', 'right', 'justify'],
    'border-style': ['none', 'solid', 'dashed', 'dotted'],
    'outline-style': ['none', 'solid', 'dashed', 'dotted'],
    'background-size': ['auto', 'cover', 'contain'],
  });
  assert.equal(keywordsOf('gap'), null);
  assert.equal(keywordsOf('__proto__'), null);
});

test('a keyword of its list, written plain, may be written to every keyword property', () => {
  for (const [property, words] of Object.entries(STYLE_KEYWORDS)) {
    for (const word of words) {
      assert.equal(styleValueRefusal(property, plainValue(word), hasHero), null, property);
    }
  }
});

test('another word, a marked keyword or a token in a keyword property is refused', () => {
  const refused: [string, StyleValue][] = [
    ['display', plainValue('contents')],
    ['align-items', plainValue('start')],
    ['display', plainValue('Flex')],
    // A keyword is never off-kit: one sent with the marker would be written with it.
    ['display', { raw: 'flex' }],
    ['flex-direction', { token: '--kit-space-md' }],
    ['background-size', plainValue('100% auto')],
  ];
  for (const [property, value] of refused) {
    assert.equal(styleValueRefusal(property, value, hasHero), 'invalid', JSON.stringify(value));
  }
});

test('a background image is only url(../img/<file>) of a file the version has', () => {
  const ok = plainValue(imageUrl('hero.png'));
  assert.deepEqual(ok, { raw: 'url(../img/hero.png)', mark: false });
  assert.equal(styleValueRefusal('background-image', ok, hasHero), null);
  const refused: StyleValue[] = [
    plainValue(imageUrl('gone.png')),
    { raw: 'url(../img/hero.png)' },
    plainValue('url(https://example.com/a.png)'),
    plainValue('url("../img/hero.png")'),
    plainValue('url(../img/../secret.png)'),
    plainValue('linear-gradient(red, blue)'),
    plainValue('none'),
    { token: '--kit-color-ink' },
  ];
  for (const value of refused) {
    assert.equal(styleValueRefusal('background-image', value, hasHero), 'invalid');
  }
});

test('token properties take any token or raw value, as in stage 4a', () => {
  for (const value of [{ token: '--kit-space-md' }, { raw: '13px' }, plainValue('auto')]) {
    assert.equal(styleValueRefusal('padding-top', value, hasHero), null);
  }
  assert.equal(styleValueRefusal('outline-offset', plainValue('anything'), hasHero), null);
});

test('an image address names a plain file and reads back to it', () => {
  assert.equal(imageOfUrl('url(../img/hero.png)'), 'hero.png');
  assert.equal(imageOfUrl(' url(../img/a_b-1.webp) '), 'a_b-1.webp');
  for (const bad of ['url(../img/a b.png)', 'url(img/a.png)', 'url(../img/a.exe)', 'none']) {
    assert.equal(imageOfUrl(bad), null, bad);
  }
  assert.equal(IMAGE_FILE.test('Logo.SVG'), true);
  assert.equal(IMAGE_FILE.test('.hidden.png'), false);
});

test('a kit word names its keyword: start is flex-start, between is space-between', () => {
  assert.equal(keywordOfWord('justify-content', 'between'), 'space-between');
  assert.equal(keywordOfWord('justify-content', 'start'), 'flex-start');
  assert.equal(keywordOfWord('align-items', 'end'), 'flex-end');
  assert.equal(keywordOfWord('align-items', 'stretch'), 'stretch');
  assert.equal(keywordOfWord('flex-direction', 'row'), 'row');
  assert.equal(keywordOfWord('flex-direction', 'horizontal'), null);
  // `between` is no word of `text-align`, and `start` of `display`.
  assert.equal(keywordOfWord('text-align', 'between'), null);
  assert.equal(keywordOfWord('display', 'start'), null);
});
