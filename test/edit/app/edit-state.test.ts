import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenOptions, versionTailwind } from '../../../src/edit/app/edit-state.ts';
import { themeOrDefault, utilityOverrides } from '../../../src/edit/domain/style/utilities.ts';
import { loadKit } from '../../../src/kit/index.ts';
import type { TailwindTheme } from '../../../src/shared/index.ts';
import { shopDraft, writeVersionFiles } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

test('a token from the project additions is offered with `added`, the kit own tokens without it', () => {
  const base = loadKit(builtinKits(), 'kitvas-ui');
  const kit = { ...base, addedTokens: ['space.12'] };
  const options = tokenOptions(kit);
  const md = options.find((option) => option.path === 'space.12');
  const sm = options.find((option) => option.path === 'space.8');
  assert.equal(md?.added, true);
  assert.equal(sm?.added, false);
  assert.equal(
    tokenOptions({ ...base, addedTokens: [] }).some((option) => option.added),
    false,
  );
});

test('a token carries the theme key its map value names, and none without one', () => {
  const base = loadKit(builtinKits(), 'kitvas-ui');
  const cssVarMap = {
    'space.8': '--spacing-8',
    'radius.sm': 'theme(borderRadius.sm)',
    'color.canvas': '--canvas',
  };
  const options = tokenOptions({ ...base, cssVarMap });
  const keyOf = (path: string) => options.find((option) => option.path === path)?.utility;
  assert.deepEqual(keyOf('space.8'), { namespace: 'spacing', name: '8' });
  assert.deepEqual(keyOf('radius.sm'), { namespace: 'borderRadius', name: 'sm' });
  // A variable of the project's own names no key without its theme, nor does a token the map
  // leaves out.
  assert.equal(keyOf('color.canvas'), undefined);
  assert.equal(keyOf('space.12'), undefined);
  assert.equal(
    options.some((option) => 'utility' in option && option.utility === undefined),
    false,
  );
});

test('a map value a theme variable only points at is read as that variable', () => {
  const base = loadKit(builtinKits(), 'kitvas-ui');
  // A Tailwind 4 kit maps onto the project's own variable; its `@theme inline` points at it.
  const kit = { ...base, cssVarMap: { 'color.accent': '--primary' } };
  const theme: TailwindTheme = {
    version: 4,
    prefix: '',
    screens: {},
    aliases: { '--primary': '--color-primary' },
  };
  const keyOf = (tailwind: TailwindTheme | null) =>
    tokenOptions(kit, tailwind).find((option) => option.path === 'color.accent')?.utility;
  assert.deepEqual(keyOf(theme), { namespace: 'color', name: 'primary' });
  assert.equal(keyOf({ ...theme, aliases: {} }), undefined);
  assert.equal(keyOf(null), undefined);
  // The class the project writes names the token.
  const tokens = tokenOptions(kit, theme);
  const read = utilityOverrides(['hover:bg-primary'], tokens, themeOrDefault(theme));
  const bg = read.find((each) => each.property === 'background-color');
  assert.equal(bg?.value, 'var(--kit-color-accent)');
});

test("a version's Tailwind is its build's, else that of the version it was copied from", () => {
  const { store } = shopDraft();
  const theme = { version: 3, prefix: 'tw-', screens: { tablet: 700 }, aliases: {} };
  const file = (schemaVersion: number) => JSON.stringify({ schemaVersion, unknown: [], theme });
  assert.equal(versionTailwind(store, 'shop', 1), null);
  writeVersionFiles(store, 'shop', 1, { 'build/json/tailwind.json': file(2) });
  assert.deepEqual(versionTailwind(store, 'shop', 1), theme);
  // Version 2 is not built yet: its classes are those of version 1.
  assert.deepEqual(versionTailwind(store, 'shop', 2), theme);
  // Its own build wins once there is one; a build that reported nothing says nothing.
  const none = JSON.stringify({ schemaVersion: 2, unknown: [], theme: null });
  writeVersionFiles(store, 'shop', 2, { 'build/json/tailwind.json': none });
  assert.equal(versionTailwind(store, 'shop', 2), null);
  // A file of the older shape is no file.
  writeVersionFiles(store, 'shop', 1, { 'build/json/tailwind.json': file(1) });
  assert.equal(versionTailwind(store, 'shop', 1), null);
});
