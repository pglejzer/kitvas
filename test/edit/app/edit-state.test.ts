import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenOptions } from '../../../src/edit/app/edit-state.ts';
import { loadKit } from '../../../src/kit/index.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

test('a token from the project additions is offered with `added`, the kit own tokens without it', () => {
  const base = loadKit(builtinKits(), 'base');
  const kit = { ...base, addedTokens: ['space.md'] };
  const options = tokenOptions(kit);
  const md = options.find((option) => option.path === 'space.md');
  const sm = options.find((option) => option.path === 'space.sm');
  assert.equal(md?.added, true);
  assert.equal(sm?.added, false);
  assert.equal(
    tokenOptions({ ...base, addedTokens: [] }).some((option) => option.added),
    false,
  );
});
