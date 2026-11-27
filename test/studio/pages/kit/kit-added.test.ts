import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlatToken } from '../../../../src/kit/index.ts';
import { type KitPart, tokenParts } from '../../../../src/studio/pages/kit/kit-token-view.ts';
import { partitionAdded, splitTokens } from '../../../../src/studio/views/kit-tokens.ts';
import { t } from '../../../helpers/translate.ts';

const dimension = (path: string[], value: number): FlatToken => ({
  path,
  type: 'dimension',
  value: { value, unit: 'px' },
});

const TOKENS: FlatToken[] = [dimension(['space', 'md'], 12), dimension(['space', 'wide'], 48)];
const NOTE = 'Added by this project. Not part of @mui/material.';

const textOf = (parts: KitPart[]): string => parts.map((part) => part.body.text).join('');

test('the added tokens leave the kit own groups and go to a group of their own', () => {
  const { own, added } = partitionAdded(TOKENS, ['space.wide']);
  assert.deepEqual(
    own.map((token) => token.path.join('.')),
    ['space.md'],
  );
  assert.deepEqual(added, [{ name: '--kit-space-wide', value: '48px' }]);
  const tokens = splitTokens(own);
  const parts = tokenParts(t, tokens, { rows: added, note: NOTE });
  const html = textOf(parts);
  // Same card and heading as the other token groups, then the note with the mark, then the rows.
  assert.ok(html.includes('<section class="kit-part kit-card" aria-labelledby="kit-added">'));
  assert.ok(html.includes(NOTE));
  assert.ok(html.includes('class="k-added"'));
  const group = html.slice(html.indexOf('aria-labelledby="kit-added"'));
  assert.ok(group.includes('<code>--kit-space-wide</code>'));
  assert.ok(
    !html.slice(0, html.indexOf('aria-labelledby="kit-added"')).includes('--kit-space-wide'),
  );
  assert.deepEqual(
    parts.map((part) => [part.id, part.count]),
    [
      ['kit-spacing', 1],
      ['kit-added', 1],
    ],
  );
});

test('with no added token there is no group and no link to it', () => {
  const { own, added } = partitionAdded(TOKENS, []);
  assert.equal(added.length, 0);
  const tokens = splitTokens(own);
  const parts = tokenParts(t, tokens, { rows: added, note: NOTE });
  assert.ok(!textOf(parts).includes('kit-added'));
  assert.deepEqual(
    parts.map((part) => part.id),
    ['kit-spacing'],
  );
});
