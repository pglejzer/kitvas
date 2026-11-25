import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  heldBy,
  isShorthand,
  rawBeside,
  rawPart,
  SHORTHANDS,
  shorthandsOf,
  splitShorthand,
  type VarKind,
  withPart,
} from '../../../../src/edit/domain/style/shorthand.ts';

/** The kit of the tests: colours under `color`, lengths under `space` and `border`. */
const kinds: VarKind = (name) => {
  if (name.startsWith('--kit-color-')) return 'color';
  return name.startsWith('--kit-space-') || name.startsWith('--kit-border-') ? 'dimension' : null;
};
const untyped: VarKind = () => null;

const LINE = 'var(--kit-color-line)';
const SURFACE = 'var(--kit-color-surface)';

// ---- The table ----------------------------------------------------------------------------------

test('a property names the shorthands that can hold it, the widest last', () => {
  assert.deepEqual(shorthandsOf('padding-top'), ['padding-block', 'padding']);
  assert.deepEqual(shorthandsOf('padding-left'), ['padding-inline', 'padding']);
  assert.deepEqual(shorthandsOf('margin-right'), ['margin-inline', 'margin']);
  assert.deepEqual(shorthandsOf('margin-block'), ['margin']);
  assert.deepEqual(shorthandsOf('border-color'), ['border']);
  assert.deepEqual(shorthandsOf('outline-style'), ['outline']);
  assert.deepEqual(shorthandsOf('background-image'), ['background']);
  assert.deepEqual(shorthandsOf('flex-wrap'), ['flex-flow']);
});

test('a property outside the table has no shorthand, and neither has a box itself', () => {
  assert.deepEqual(shorthandsOf('gap'), []);
  assert.deepEqual(shorthandsOf('border-radius'), []);
  assert.deepEqual(shorthandsOf('background-size'), []);
  assert.deepEqual(shorthandsOf('padding'), []);
});

test('every shorthand of the list answers for the properties that name it', () => {
  for (const shorthand of SHORTHANDS) {
    assert.equal(isShorthand(shorthand), true);
    for (const property of heldBy(shorthand)) {
      assert.equal(shorthandsOf(property).includes(shorthand), true, `${shorthand}: ${property}`);
    }
  }
  assert.equal(isShorthand('border-top'), false);
  assert.equal(isShorthand('font'), false);
});

// ---- Splitting ----------------------------------------------------------------------------------

test('padding of one value is every side and both pairs', () => {
  assert.deepEqual(splitShorthand('padding', '8px', kinds), {
    'padding-top': '8px',
    'padding-right': '8px',
    'padding-bottom': '8px',
    'padding-left': '8px',
    'padding-block': '8px',
    'padding-inline': '8px',
  });
});

test('margin of two values is top and bottom, then right and left', () => {
  assert.deepEqual(splitShorthand('margin', '0 auto', kinds), {
    'margin-top': '0',
    'margin-right': 'auto',
    'margin-bottom': '0',
    'margin-left': 'auto',
    'margin-block': '0',
    'margin-inline': 'auto',
  });
});

test('three values leave the left to the right, and the block pair reads as two values', () => {
  assert.deepEqual(splitShorthand('padding', '1px 2px 3px', kinds), {
    'padding-top': '1px',
    'padding-right': '2px',
    'padding-bottom': '3px',
    'padding-left': '2px',
    'padding-block': '1px 3px',
    'padding-inline': '2px',
  });
});

test('a pair read from four values is its start and its end, in that order', () => {
  const held = splitShorthand('padding', '1px 2px 3px 4px', kinds);
  assert.equal(held?.['padding-block'], '1px 3px');
  // The inline start is the left side.
  assert.equal(held?.['padding-inline'], '4px 2px');
  assert.equal(held?.['padding-left'], '4px');
});

test('a box takes a length, a number, a percentage, auto, var and calc', () => {
  const value = '0 50% var(--kit-space-md) calc(1rem + 2px)';
  assert.deepEqual(splitShorthand('margin', value, untyped), {
    'margin-top': '0',
    'margin-right': '50%',
    'margin-bottom': 'var(--kit-space-md)',
    'margin-left': 'calc(1rem + 2px)',
    'margin-block': '0 var(--kit-space-md)',
    'margin-inline': 'calc(1rem + 2px) 50%',
  });
});

test('the four pairs answer for their two sides', () => {
  assert.deepEqual(splitShorthand('padding-block', '8px 16px', kinds), {
    'padding-top': '8px',
    'padding-bottom': '16px',
  });
  assert.deepEqual(splitShorthand('padding-inline', '4px', kinds), {
    'padding-left': '4px',
    'padding-right': '4px',
  });
  assert.deepEqual(splitShorthand('margin-block', '-8px 0', kinds), {
    'margin-top': '-8px',
    'margin-bottom': '0',
  });
  assert.deepEqual(splitShorthand('margin-inline', '0 auto', kinds), {
    'margin-left': '0',
    'margin-right': 'auto',
  });
});

test('border splits into width, style and colour in any order', () => {
  const expected = { 'border-width': '1px', 'border-style': 'solid', 'border-color': '#ddd' };
  assert.deepEqual(splitShorthand('border', '1px solid #ddd', kinds), expected);
  assert.deepEqual(splitShorthand('border', 'solid #ddd 1px', kinds), expected);
  assert.deepEqual(splitShorthand('border', '#ddd 1px solid', kinds), expected);
});

test('border reads a token by its type, and leaves out what is not written', () => {
  assert.deepEqual(splitShorthand('border', `var(--kit-border-sm) solid ${LINE}`, kinds), {
    'border-width': 'var(--kit-border-sm)',
    'border-style': 'solid',
    'border-color': LINE,
  });
  assert.deepEqual(splitShorthand('border', '1px solid', kinds), {
    'border-width': '1px',
    'border-style': 'solid',
  });
  assert.deepEqual(splitShorthand('border', 'thin', kinds), { 'border-width': 'thin' });
  assert.deepEqual(splitShorthand('border', 'rgb(0 0 0 / 20%)', kinds), {
    'border-color': 'rgb(0 0 0 / 20%)',
  });
});

test('outline splits as border does, with auto as a style', () => {
  assert.deepEqual(splitShorthand('outline', '2px dashed red', kinds), {
    'outline-width': '2px',
    'outline-style': 'dashed',
    'outline-color': 'red',
  });
  assert.deepEqual(splitShorthand('outline', 'auto 2px', kinds), {
    'outline-style': 'auto',
    'outline-width': '2px',
  });
  assert.equal(splitShorthand('border', 'auto 2px', kinds), null);
});

test('background is a colour, an image, or both', () => {
  assert.deepEqual(splitShorthand('background', '#fff', kinds), { 'background-color': '#fff' });
  assert.deepEqual(splitShorthand('background', 'url(../img/hero.png)', kinds), {
    'background-image': 'url(../img/hero.png)',
  });
  assert.deepEqual(splitShorthand('background', `url("../img/a b.png") ${SURFACE}`, kinds), {
    'background-image': 'url("../img/a b.png")',
    'background-color': SURFACE,
  });
});

test('flex-flow is a direction, a wrap, or both', () => {
  assert.deepEqual(splitShorthand('flex-flow', 'row wrap', kinds), {
    'flex-direction': 'row',
    'flex-wrap': 'wrap',
  });
  assert.deepEqual(splitShorthand('flex-flow', 'column', kinds), { 'flex-direction': 'column' });
  assert.deepEqual(splitShorthand('flex-flow', 'nowrap', kinds), { 'flex-wrap': 'nowrap' });
});

// ---- Values that must not split -----------------------------------------------------------------

test('a value that is not plain CSS does not split', () => {
  assert.equal(splitShorthand('padding', '8px !important', kinds), null);
  assert.equal(splitShorthand('border', '1px solid #ddd /* line */', kinds), null);
  assert.equal(splitShorthand('padding', '8px // note', kinds), null);
  assert.equal(splitShorthand('padding', '#{$gap} 8px', kinds), null);
  assert.equal(splitShorthand('margin', '$x', kinds), null);
  assert.equal(splitShorthand('margin', '8px $x', kinds), null);
  assert.equal(splitShorthand('padding', 'map.get($space, md)', kinds), null);
  assert.equal(splitShorthand('padding', '', kinds), null);
});

test('a background with a gradient, two layers, a position or a size does not split', () => {
  assert.equal(splitShorthand('background', 'linear-gradient(#fff, #000)', kinds), null);
  assert.equal(splitShorthand('background', 'url(a.png), url(b.png)', kinds), null);
  assert.equal(splitShorthand('background', 'url(a.png) center', kinds), null);
  assert.equal(splitShorthand('background', '#fff url(a.png) no-repeat', kinds), null);
  assert.equal(splitShorthand('background', 'url(a.png) center / cover', kinds), null);
  assert.equal(splitShorthand('background', 'none', kinds), null);
  assert.equal(splitShorthand('background', '#fff #000', kinds), null);
});

test('a var no token types does not split a border, an outline or a background', () => {
  assert.equal(splitShorthand('border', '1px solid var(--line)', kinds), null);
  assert.equal(splitShorthand('border', `1px solid ${LINE}`, untyped), null);
  assert.equal(splitShorthand('outline', 'var(--kit-radius-md) solid', kinds), null);
  assert.equal(splitShorthand('background', 'var(--kit-space-md)', kinds), null);
});

test('a var with a fallback is read by its token as one without', () => {
  const value = 'var(--kit-color-surface, #fff)';
  assert.deepEqual(splitShorthand('background', value, kinds), { 'background-color': value });
  // Not a token alone: the part is a raw value.
  assert.equal(rawPart('background-color', value), true);
});

test('a part the shorthand does not take, or takes once, does not split', () => {
  assert.equal(splitShorthand('padding', '1px 2px 3px 4px 5px', kinds), null);
  assert.equal(splitShorthand('padding-block', '1px 2px 3px', kinds), null);
  assert.equal(splitShorthand('padding', '8px solid', kinds), null);
  assert.equal(splitShorthand('padding', 'min(8px, 2vw)', kinds), null);
  assert.equal(splitShorthand('border', 'solid dashed', kinds), null);
  assert.equal(splitShorthand('border', '1px 2px solid', kinds), null);
  assert.equal(splitShorthand('border', '1px solid #ddd inset-shadow', kinds), null);
  assert.equal(splitShorthand('flex-flow', 'row column', kinds), null);
  assert.equal(splitShorthand('flex-flow', 'row dense', kinds), null);
});

// ---- One part set -------------------------------------------------------------------------------

test('a new part changes only that part of the value', () => {
  assert.equal(
    withPart('border', '1px solid #ddd', 'border-color', LINE, kinds),
    `1px solid ${LINE}`,
  );
  assert.equal(withPart('background', '#fff', 'background-color', SURFACE, kinds), SURFACE);
  assert.equal(withPart('padding', '8px 16px', 'padding-top', '12px', kinds), '12px 16px 8px');
});

test('the other parts of a border stay as written, spaces and case too', () => {
  assert.equal(
    withPart('border', '#DDD   1PX  solid', 'border-width', '2px', kinds),
    '#DDD   2px  solid',
  );
  assert.equal(withPart('flex-flow', 'row wrap', 'flex-direction', 'column', kinds), 'column wrap');
});

test('a part the shorthand left out is added at its end', () => {
  assert.equal(withPart('border', '1px solid', 'border-color', '#ddd', kinds), '1px solid #ddd');
  assert.equal(
    withPart('background', '#fff', 'background-image', 'url(../img/hero.png)', kinds),
    '#fff url(../img/hero.png)',
  );
  assert.equal(withPart('flex-flow', 'column', 'flex-wrap', 'wrap', kinds), 'column wrap');
});

test('a box is written as the fewest values that say it', () => {
  const four = '8px 16px 8px 16px';
  assert.equal(withPart('padding', four, 'padding-top', '8px', kinds), '8px 16px');
  assert.equal(withPart('padding', four, 'padding-left', '4px', kinds), '8px 16px 8px 4px');
  assert.equal(withPart('padding', '12px 16px 8px', 'padding-top', '8px', kinds), '8px 16px');
  assert.equal(withPart('margin', '8px 16px', 'margin-right', '8px', kinds), '8px 8px 8px 16px');
  assert.equal(withPart('margin', '8px 8px 8px 16px', 'margin-left', '8px', kinds), '8px');
});

test('a pair written into a box sets its two sides', () => {
  assert.equal(withPart('padding', '8px', 'padding-inline', '16px', kinds), '8px 16px');
  assert.equal(withPart('padding', '8px', 'padding-block', '4px 12px', kinds), '4px 8px 12px');
  // The inline start is the left side.
  assert.equal(withPart('padding', '8px', 'padding-inline', '4px 12px', kinds), '8px 12px 8px 4px');
});

test('a side written into a pair keeps the other side', () => {
  assert.equal(withPart('padding-block', '8px', 'padding-bottom', '16px', kinds), '8px 16px');
  assert.equal(withPart('padding-block', '8px 16px', 'padding-bottom', '8px', kinds), '8px');
  assert.equal(withPart('margin-inline', '0 auto', 'margin-left', 'auto', kinds), 'auto');
  assert.equal(withPart('margin-inline', 'auto', 'margin-right', '0', kinds), 'auto 0');
});

// ---- One part taken out -------------------------------------------------------------------------

test('a part leaves a border with the space beside it', () => {
  assert.equal(withPart('border', '1px solid #ddd', 'border-style', null, kinds), '1px #ddd');
  assert.equal(withPart('border', '1px solid #ddd', 'border-color', null, kinds), '1px solid');
  assert.equal(withPart('border', '1px  solid  #ddd', 'border-width', null, kinds), 'solid  #ddd');
  assert.equal(withPart('flex-flow', 'row wrap', 'flex-wrap', null, kinds), 'row');
});

test('the last part taken out leaves nothing', () => {
  assert.equal(withPart('background', '#fff', 'background-color', null, kinds), '');
  assert.equal(withPart('border', 'solid', 'border-style', null, kinds), '');
});

test('a side cannot leave a box or a pair, and a part that is not there cannot leave', () => {
  assert.equal(withPart('padding', '8px 16px', 'padding-top', null, kinds), null);
  assert.equal(withPart('padding', '8px 16px', 'padding-inline', null, kinds), null);
  assert.equal(withPart('margin-block', '8px 16px', 'margin-top', null, kinds), null);
  assert.equal(withPart('border', '1px solid', 'border-color', null, kinds), null);
});

// ---- No such value ------------------------------------------------------------------------------

test('a value CSS has no place for answers null', () => {
  // A property the shorthand does not hold.
  assert.equal(withPart('border', '1px solid', 'padding-top', '1px', kinds), null);
  assert.equal(withPart('padding-block', '8px', 'padding-left', '1px', kinds), null);
  // A part of another kind than the property's.
  assert.equal(withPart('border', '1px solid #ddd', 'border-color', '2px', kinds), null);
  assert.equal(withPart('border', '1px solid #ddd', 'border-width', '1px 2px', kinds), null);
  assert.equal(withPart('padding', '8px', 'padding-top', '1px 2px', kinds), null);
  assert.equal(withPart('padding', '8px', 'padding-top', 'solid', kinds), null);
  assert.equal(withPart('padding', '8px', 'padding-block', '1px 2px 3px', kinds), null);
  // A token nothing types.
  assert.equal(withPart('border', '1px solid #ddd', 'border-color', LINE, untyped), null);
});

test('a value that does not split is never written into', () => {
  const gradient = 'linear-gradient(#fff, #000)';
  assert.equal(withPart('background', gradient, 'background-color', '#fff', kinds), null);
  assert.equal(withPart('padding', '8px !important', 'padding-top', '4px', kinds), null);
  assert.equal(withPart('border', '1px solid $line', 'border-width', '2px', kinds), null);
  assert.equal(withPart('background', gradient, 'background-color', null, kinds), null);
});

// ---- Raw parts ----------------------------------------------------------------------------------

test('a part is raw when it is a value of a token property that is no token and no keyword', () => {
  assert.equal(rawPart('border-color', '#ddd'), true);
  assert.equal(rawPart('border-color', 'red'), true);
  assert.equal(rawPart('border-width', '1px'), true);
  assert.equal(rawPart('padding-block', '8px var(--kit-space-md)'), true);
  assert.equal(rawPart('border-color', LINE), false);
  assert.equal(rawPart('padding-block', 'var(--kit-space-sm) var(--kit-space-md)'), false);
  assert.equal(rawPart('margin-right', 'auto'), false);
  assert.equal(rawPart('border-width', 'thin'), false);
  // A keyword and an image are never off-kit.
  assert.equal(rawPart('border-style', 'solid'), false);
  assert.equal(rawPart('flex-direction', 'row'), false);
  assert.equal(rawPart('background-image', 'url(../img/hero.png)'), false);
});

test('a shorthand has a raw part beside a property while another part of it is raw', () => {
  const thin = 'var(--kit-border-sm)';
  assert.equal(rawBeside('border', `1px solid ${LINE}`, 'border-color', kinds), true);
  assert.equal(rawBeside('border', `${thin} solid #ddd`, 'border-color', kinds), false);
  assert.equal(rawBeside('border', `${thin} solid #ddd`, 'border-width', kinds), true);
  assert.equal(rawBeside('border', `${thin} solid ${LINE}`, 'border-style', kinds), false);
  assert.equal(rawBeside('background', '#fff url(../img/a.png)', 'background-image', kinds), true);
  assert.equal(rawBeside('background', '#fff url(../img/a.png)', 'background-color', kinds), false);
  assert.equal(rawBeside('margin', '8px auto', 'margin-top', kinds), true);
  assert.equal(rawBeside('margin', 'var(--kit-space-md) auto', 'margin-bottom', kinds), false);
});

test('a pair of a box is beside the other two sides only', () => {
  const value = 'var(--kit-space-sm) 16px';
  assert.equal(rawBeside('padding', value, 'padding-block', kinds), true);
  assert.equal(rawBeside('padding', value, 'padding-inline', kinds), false);
  assert.equal(rawBeside('padding', value, 'padding-right', kinds), true);
});
