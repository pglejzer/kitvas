// The source line of a style row at the base (ADR 0070): the class rule, or the shorthand of it
// that holds the row's value.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ruleSourceText } from '../../../../../client/studio/edit/props/style.ts';

test('a row names the shorthand that holds its value, else the rule alone', () => {
  // Outside a page the editor has no texts, and every text shows as its key.
  assert.equal(ruleSourceText('card', 'padding'), 'props.source.shorthand');
  assert.equal(ruleSourceText('card', 'border'), 'props.source.shorthand');
  assert.equal(ruleSourceText('card', undefined), 'props.source.scss');
});
