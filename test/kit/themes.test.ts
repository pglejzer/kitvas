// Themes of a kit and the project's tokens (ADR 0083): the kit's theme files, the additions'
// `tokens.json` and `tokens.<theme>.json`, their issues and the kit's hash.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import {
  type FlatToken,
  flattenTokens,
  formatTokenValue,
  type LoadedKit,
  layTokens,
  listKits,
  loadKit,
  parseKit,
} from '../../src/kit/index.ts';
import { FIXTURE_KITS, srgb, themedTiny, tinyKitJson } from '../helpers/kit/kits.ts';
import { additionsProject, star, starFile } from './helpers/additions.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
  writeText,
} from './helpers/project-kit.ts';

const AT = '.kitvas/additions/tiny';
const DARK = 'json/tokens.dark.json';

const fixtureJson = (file: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_KITS, 'tiny', ...file.split('/')), 'utf8'));

/** Each token as its path with dots and its CSS value. */
const values = (tokens: readonly FlatToken[] | undefined): [string, string][] =>
  (tokens ?? []).map((token) => [token.path.join('.'), formatTokenValue(token)]);

/** A project over a copy of tiny with themes (or the plain fixture kits), and its additions folder. */
function project(themed: boolean) {
  const dir = tempProject();
  const kits = layeredStore(dir, themed ? themedTiny() : FIXTURE_KITS);
  const additions = join(dir, '.kitvas', 'additions', 'tiny');
  const add = (name: string, json: unknown): void =>
    writeText(join(additions, name), typeof json === 'string' ? json : JSON.stringify(json));
  return { dir, kits, add, load: (): LoadedKit => loadKit(kits, 'tiny') };
}

test('the default theme is the base; a theme file holds what differs, and an alias follows', () => {
  const loaded = loadKit(createFolderKitStore(themedTiny()), 'tiny');
  assert.deepEqual(loaded.issues, []);
  assert.deepEqual(loaded.themes, {
    default: 'light',
    list: [
      { id: 'light', label: 'Light', added: false, attributes: {} },
      { id: 'dark', label: 'Dark', added: false, attributes: { 'data-tiny-scheme': 'dark' } },
    ],
  });
  assert.deepEqual(loaded.themeTokens.light, []);
  // `color.accent` is `{color.ink}` in the base, so it is light in the dark theme too.
  assert.deepEqual(values(loaded.themeTokens.dark), [
    ['color.ink', '#cccccc'],
    ['color.accent', '#cccccc'],
  ]);
  assert.equal(loaded.tokens.length, 8);
  assert.equal(formatTokenValue(loaded.tokens[0] as FlatToken), '#1d2025');
  assert.deepEqual(loaded.addedTokens, []);
});

test('a kit without themes has an empty list', () => {
  const loaded = loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny');
  assert.deepEqual(loaded.themes, { default: 'default', list: [] });
  assert.deepEqual(loaded.themeTokens, {});
});

test('a theme file with a path or a type the base lacks is an issue that names the file', () => {
  const root = themedTiny({
    color: { ink: { $value: srgb(0.8, 0.8, 0.8) }, nope: { $value: srgb(0, 0, 0) } },
    space: { sm: { $type: 'color', $value: srgb(0, 0, 0) } },
  });
  const loaded = loadKit(createFolderKitStore(root), 'tiny');
  assert.deepEqual(loaded.issues, [
    {
      path: DARK,
      key: 'kitIssue.themeTokenUnknown',
      params: { path: 'color.nope', file: DARK },
    },
    {
      path: DARK,
      key: 'kitIssue.themeTokenType',
      params: { path: 'space.sm', file: DARK, type: 'color', baseType: 'dimension' },
    },
  ]);
  // What the file may set still shows.
  assert.deepEqual(
    values(loaded.themeTokens.dark).map(([path]) => path),
    ['color.ink', 'color.accent'],
  );
});

test('a missing theme file or one that is not JSON is an issue, and the kit still loads', () => {
  const root = themedTiny();
  const file = join(root, 'tiny', ...DARK.split('/'));
  rmSync(file);
  const missing = loadKit(createFolderKitStore(root), 'tiny');
  assert.deepEqual(missing.issues, [
    { path: 'tokens.themes.dark', key: 'kitIssue.fileMissing', params: { file: DARK } },
  ]);
  assert.deepEqual(missing.themeTokens.dark, []);
  writeFileSync(file, '{not json');
  assert.deepEqual(loadKit(createFolderKitStore(root), 'tiny').issues, [
    { path: DARK, key: 'kitIssue.tokensFile', params: { file: DARK } },
  ]);
});

test('the list says each id once, names its default, and the default has no file', () => {
  const base = fixtureJson('json/tokens.json');
  const lay = (themes: unknown) => {
    const json = tinyKitJson();
    (json.tokens as Record<string, unknown>).themes = themes;
    return layTokens({
      kit: parseKit(json, 'tiny'),
      base,
      baseTokens: flattenTokens(base).tokens,
      themeFiles: {},
      additions: {},
      additionsAt: AT,
    });
  };
  const twice = lay({
    default: 'dusk',
    list: [
      { id: 'light', label: 'Light', file: 'json/x.json' },
      { id: 'light', label: 'Again' },
    ],
  });
  assert.deepEqual(
    twice.issues.map((issue) => [issue.key, issue.params.theme ?? issue.params.file]),
    [
      ['kitIssue.themeTwice', 'light'],
      ['kitIssue.themeDefault', 'dusk'],
      ['kitIssue.fileMissing', 'json/x.json'],
    ],
  );
  assert.deepEqual(
    twice.themes.list.map((theme) => theme.label),
    ['Light'],
  );
  const own = lay({
    default: 'light',
    list: [
      { id: 'light', label: 'Light', file: 'json/tokens.light.json' },
      { id: 'dark', label: 'Dark' },
    ],
  });
  assert.deepEqual(own.issues, [
    { path: 'tokens.themes.light', key: 'kitIssue.themeDefaultFile', params: { theme: 'light' } },
  ]);
});

test('the project adds tokens: a new path joins the kit, a path or a group the kit has is refused', () => {
  const shop = project(false);
  const before = shop.load().hash;
  const raw = {
    color: { brandSoft: { $value: '{color.ink}' }, ink: { $value: srgb(1, 0, 0) } },
    space: { huge: { $value: { value: 64, unit: 'px' } } },
    motion: { $type: 'duration', $value: { value: 1, unit: 's' } },
  };
  shop.add('tokens.json', raw);
  const loaded = shop.load();
  const file = `${AT}/tokens.json`;
  assert.deepEqual(loaded.issues, [
    { path: file, key: 'kitIssue.additionTokenTaken', params: { path: 'color.ink', file } },
    { path: file, key: 'kitIssue.additionTokenTaken', params: { path: 'motion', file } },
  ]);
  assert.deepEqual(loaded.addedTokens, ['color.brandSoft', 'space.huge']);
  assert.equal(loaded.tokens.length, 10);
  const byPath = new Map(values(loaded.tokens));
  // The kit's own value stays; a new token may point at one of the kit's and keeps its group's type.
  assert.equal(byPath.get('color.ink'), '#1d2025');
  assert.equal(byPath.get('color.brandSoft'), '#1d2025');
  assert.equal(byPath.get('space.huge'), '64px');
  assert.notEqual(loaded.hash, before);
  assert.deepEqual(shop.kits.readAdditions?.('tiny'), {
    json: undefined,
    dir: join(shop.dir, '.kitvas', 'additions', 'tiny'),
    tokens: { 'tokens.json': raw },
  });
});

test('a theme id the kit lacks is an added theme; a kit without themes gets its base as default', () => {
  const shop = project(false);
  shop.add('tokens.json', { color: { brandSoft: { $value: '{color.ink}' } } });
  shop.add('tokens.sepia.json', { color: { ink: { $value: srgb(0.4, 0.2, 0) } } });
  const loaded = shop.load();
  assert.deepEqual(loaded.issues, []);
  assert.deepEqual(loaded.themes, {
    default: 'default',
    list: [
      { id: 'default', label: 'Default', added: false, attributes: {} },
      { id: 'sepia', label: 'Sepia', added: true, attributes: {} },
    ],
  });
  assert.deepEqual(loaded.themeTokens.default, []);
  // The project's own token follows the theme as the kit's do.
  assert.deepEqual(values(loaded.themeTokens.sepia), [
    ['color.ink', '#663300'],
    ['color.accent', '#663300'],
    ['color.brandSoft', '#663300'],
  ]);
});

test('an added value of a kit theme: one the kit sets is refused, one it does not marks the theme', () => {
  const shop = project(true);
  shop.add('tokens.dark.json', {
    color: { ink: { $value: srgb(1, 0, 0) }, veil: { $value: srgb(0.2, 0.2, 0.2) } },
  });
  shop.add('tokens.light.json', { color: { veil: { $value: srgb(0, 0, 0) } } });
  shop.add('tokens.dark_mode.json', {});
  const loaded = shop.load();
  const dark = `${AT}/tokens.dark.json`;
  assert.deepEqual(loaded.issues, [
    {
      path: dark,
      key: 'kitIssue.additionValueSet',
      params: { theme: 'dark', path: 'color.ink', file: dark },
    },
    {
      path: `${AT}/tokens.dark_mode.json`,
      key: 'kitIssue.additionTokensName',
      params: { file: `${AT}/tokens.dark_mode.json` },
    },
    {
      path: `${AT}/tokens.light.json`,
      key: 'kitIssue.additionDefaultTheme',
      params: { file: `${AT}/tokens.light.json`, theme: 'light' },
    },
  ]);
  assert.deepEqual(
    loaded.themes.list.map((theme) => [theme.id, theme.added]),
    [
      ['light', false],
      ['dark', true],
    ],
  );
  assert.deepEqual(values(loaded.themeTokens.dark), [
    ['color.ink', '#cccccc'],
    ['color.accent', '#cccccc'],
    ['color.veil', '#333333'],
  ]);
});

test('a malformed addition is an issue that names it; the kit, its components and other kits load', () => {
  const shop = additionsProject();
  writeProjectKit(shop.project, npmKitJson(), {
    'json/tokens.json': JSON.stringify(ACME_TOKENS),
    'json/css-var-map.json': JSON.stringify(ACME_MAP),
  });
  writeText(join(shop.additionsDir('tiny'), 'tokens.json'), '{not json');
  writeText(join(shop.additionsDir('tiny'), 'tokens.dusk.json'), '[]');
  // A folder with token files and no additions.json yet takes a component.
  shop.writer.writeAddition('tiny', star(), [starFile()], false);

  const loaded = loadKit(shop.kits, 'tiny');
  assert.deepEqual(loaded.issues, [
    {
      path: `${AT}/tokens.json`,
      key: 'kitIssue.tokensFile',
      params: { file: `${AT}/tokens.json` },
    },
    {
      path: `${AT}/tokens.dusk.json`,
      key: 'kitIssue.tokensFile',
      params: { file: `${AT}/tokens.dusk.json` },
    },
  ]);
  assert.deepEqual(loaded.additions, ['Star']);
  assert.equal(loaded.tokens.length, 8);
  assert.deepEqual(loaded.themes.list, []);
  assert.deepEqual(loadKit(shop.kits, 'acme').issues, []);
  assert.deepEqual(
    listKits(shop.kits).map((kit) => [kit.id, kit.valid]),
    [
      ['acme', true],
      ['broken', false],
      ['tiny', false],
    ],
  );
});

test('a kit without theme files or token files keeps its hash; each of them changes it', () => {
  const before = createHash('sha256')
    .update(JSON.stringify([fixtureJson('kit.json'), fixtureJson('json/tokens.json')]))
    .digest('hex');
  assert.equal(loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny').hash, before);
  const shop = project(false);
  assert.equal(shop.load().hash, before);
  shop.add('tokens.json', {});
  assert.notEqual(shop.load().hash, before);

  const dark = loadKit(createFolderKitStore(themedTiny()), 'tiny').hash;
  const blue = themedTiny({ color: { ink: { $value: srgb(0, 0, 1) } } });
  assert.notEqual(loadKit(createFolderKitStore(blue), 'tiny').hash, dark);
});
