import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fontStyle, loadFonts, readStyle } from '../../../client/figma/fonts.ts';
import { createFigmaFake, FAKE_FONTS } from '../../helpers/figma-fake.ts';

const FOUR = ['Regular', 'Medium', 'Semi Bold', 'Bold'];

test('fontStyle picks the nearest of four styles for each weight from 100 to 900', () => {
  const picked = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) =>
    fontStyle(weight, false, FOUR),
  );
  assert.deepEqual(picked, [
    'Regular',
    'Regular',
    'Regular',
    'Regular',
    'Medium',
    'Semi Bold',
    'Bold',
    'Bold',
    'Bold',
  ]);
  // A tie goes to the lighter style up to 500 and to the heavier one above it.
  assert.equal(fontStyle(450, false, FOUR), 'Regular');
  assert.equal(fontStyle(650, false, FOUR), 'Bold');
});

test('fontStyle keeps the slant when the family has it, and reads the usual style names', () => {
  const styles = FAKE_FONTS.map((font) => font.style);
  assert.equal(fontStyle(400, true, styles), 'Italic');
  assert.equal(fontStyle(700, true, styles), 'Bold Italic');
  assert.equal(fontStyle(600, false, styles), 'Semi Bold');
  // No italic in the family: the upright style of the nearest weight.
  assert.equal(fontStyle(700, true, FOUR), 'Bold');
  // Other spellings of the same weights.
  assert.equal(fontStyle(600, false, ['Regular', 'SemiBold', 'ExtraBold']), 'SemiBold');
  assert.equal(fontStyle(800, false, ['Book', 'Demi-Bold', 'Heavy']), 'Heavy');
  assert.equal(fontStyle(100, false, ['Thin', 'Light', 'Regular']), 'Thin');
  // A list kitvas cannot read gives its first style; an empty one gives Regular.
  assert.equal(fontStyle(400, false, ['Condensed', 'Wide']), 'Condensed');
  assert.equal(fontStyle(400, false, []), 'Regular');
});

test('readStyle reads the weight and the slant of a style name', () => {
  assert.deepEqual(readStyle('Semi Bold Italic'), { weight: 600, italic: true });
  assert.deepEqual(readStyle('Italic'), { weight: 400, italic: true });
  assert.deepEqual(readStyle('Extra Light'), { weight: 200, italic: false });
  assert.deepEqual(readStyle('Bold Oblique'), { weight: 700, italic: true });
  assert.equal(readStyle('Condensed'), null);
});

test('loadFonts loads each font once, and sets a family Figma lacks in Inter', async () => {
  const { figma, calls } = createFigmaFake({
    fonts: [...FAKE_FONTS, { family: 'Lora', style: 'Regular' }, { family: 'Lora', style: 'Bold' }],
  });
  const fonts = await loadFonts(figma, [
    { family: 'Lora', weight: 700, italic: false },
    { family: 'Lora', weight: 650, italic: false },
    { family: 'Brand Sans', weight: 600, italic: false },
    { family: 'Brand Sans', weight: 400, italic: true },
  ]);
  assert.deepEqual(fonts.font('Lora', 700, false), { family: 'Lora', style: 'Bold' });
  assert.deepEqual(fonts.font('Brand Sans', 600, false), { family: 'Inter', style: 'Semi Bold' });
  assert.deepEqual(fonts.font('Brand Sans', 400, true), { family: 'Inter', style: 'Italic' });
  assert.equal(fonts.has('Lora'), true);
  assert.equal(fonts.has('Brand Sans'), false);
  assert.deepEqual(fonts.missing, ['Brand Sans']);
  const loaded = calls.filter((call) => call.name === 'loadFontAsync').map((call) => call.args[0]);
  // Inter Regular (every new text starts in it), Lora Bold, Inter Semi Bold, Inter Italic.
  assert.equal(loaded.length, 4);
  assert.equal(calls.filter((call) => call.name === 'listAvailableFontsAsync').length, 1);
});

test('a listed font that does not load is set in Inter too', async () => {
  const { figma } = createFigmaFake();
  // Listed, but the fake has no such font to load.
  const ghost = { fontName: { family: 'Ghost', style: 'Regular' } };
  const lying = new Proxy(figma, {
    get(target, key) {
      if (key === 'listAvailableFontsAsync') {
        return async () => [...(await target.listAvailableFontsAsync()), ghost];
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const fonts = await loadFonts(lying, [{ family: 'Ghost', weight: 400, italic: false }]);
  assert.deepEqual(fonts.font('Ghost', 400, false), { family: 'Inter', style: 'Regular' });
  assert.deepEqual(fonts.missing, ['Ghost']);
});
