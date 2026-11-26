import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenItems } from '../../../../../../client/studio/edit/props/values/token-items.ts';
import type { TokenOption } from '../../../../../../src/edit/index.ts';

const token = (path: string, css: string): TokenOption => ({
  var: `--kit-${path.replaceAll('.', '-')}`,
  path,
  type: 'color',
  css,
});

test('a token is named by the last part of its path, in the group before it', () => {
  const [ink, brand, bare] = tokenItems(
    [
      { ...token('color.inkSoft', '#a4a9b2'), var: '--kit-color-ink-soft' },
      token('color.brand.500', '#336'),
      token('space', '4px'),
    ],
    { colour: false },
  );
  assert.deepEqual(ink, {
    value: '--kit-color-ink-soft',
    name: 'inkSoft',
    group: 'color',
    detail: '#a4a9b2',
    swatch: null,
    warn: null,
  });
  assert.equal(brand?.name, '500');
  assert.equal(brand?.group, 'color.brand');
  assert.equal(bare?.group, null);
  assert.equal(bare?.name, 'space');
});

test('colour rows get a swatch, others none', () => {
  const tokens = [token('color.inkSoft', '#a4a9b2')];
  assert.equal(tokenItems(tokens, { colour: true })[0]?.swatch, '#a4a9b2');
  assert.equal(tokenItems(tokens, { colour: false })[0]?.swatch, null);
});

test('a warning goes on its token only', () => {
  const tokens = [token('color.ink', '#111'), token('color.paper', '#fff')];
  const items = tokenItems(tokens, {
    colour: true,
    warn: (one) => (one.path === 'color.ink' ? 'low contrast' : null),
  });
  assert.equal(items[0]?.warn, 'low contrast');
  assert.equal(items[1]?.warn, null);
});
