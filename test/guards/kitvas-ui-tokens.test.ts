import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DARK_THEMES, kitvasUiFiles } from '../../scripts/kitvas-ui-tokens.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { isRecord } from '../../src/shared/index.ts';
import { ICONS } from '../../src/studio/pages/icons/paths.ts';
import { rgbOf } from '../../src/studio/theme/contrast.ts';
import {
  ACCENT_COLORS,
  type Accent,
  THEME_COLORS,
  type Theme,
} from '../../src/studio/theme/tokens.ts';

const files = kitvasUiFiles();
const KIT = 'kits/kitvas-ui';

/** The eight themes of the kit, in order (plan 27, C2). */
const THEME_IDS = [
  'light',
  'dark',
  'light-teal',
  'dark-teal',
  'light-coral',
  'dark-coral',
  'light-rose',
  'dark-rose',
];

function fileText(path: string): string {
  const found = files.find((file) => file.path === path);
  assert.ok(found, `${path} is not a generated file`);
  return found.text;
}

/** The tokens of a parsed token file by dot path, each with its `$value`. */
function flat(node: unknown, path: string[] = [], out = new Map<string, unknown>()) {
  if (!isRecord(node)) return out;
  if ('$value' in node) {
    out.set(path.join('.'), node.$value);
    return out;
  }
  for (const [key, child] of Object.entries(node)) {
    if (!key.startsWith('$')) flat(child, [...path, key], out);
  }
  return out;
}

/** The kit's tokens in one theme: the base with the theme's own values on it. */
function themeTokens(id: string): Map<string, unknown> {
  const tokens = flat(JSON.parse(fileText(`${KIT}/json/tokens.json`)));
  if (id === 'light') return tokens;
  for (const [path, value] of flat(JSON.parse(fileText(`${KIT}/json/tokens.${id}.json`)))) {
    tokens.set(path, value);
  }
  return tokens;
}

/** The channels of a colour token, 0 to 1, and its alpha. */
function channels(value: unknown): number[] {
  assert.ok(isRecord(value) && Array.isArray(value.components), 'not a colour value');
  return value.components.map(Number);
}

/** Whether a kit colour is the studio's `#rrggbb`, compared as numbers. */
function assertColor(value: unknown, hex: string, what: string): void {
  const rgb = rgbOf(hex);
  assert.ok(rgb, `${what}: ${hex} is no colour`);
  const got = channels(value);
  rgb.forEach((channel, index) => {
    assert.ok(
      Math.abs((got[index] ?? -1) - channel / 255) < 0.001,
      `${what}: ${hex} is [${got.join(', ')}] in the kit`,
    );
  });
}

const parts = (id: string): { theme: Theme; accent: Accent } => {
  const [theme, accent = 'copper'] = id.split('-');
  assert.ok(theme === 'light' || theme === 'dark');
  assert.ok(accent === 'copper' || accent === 'teal' || accent === 'coral' || accent === 'rose');
  return { theme, accent };
};

test('the generated files of kitvas-ui are what the script writes', () => {
  for (const file of files) {
    const onDisk = readFileSync(join(PLUGIN_ROOT, ...file.path.split('/')), 'utf8');
    assert.equal(
      onDisk.replaceAll('\r\n', '\n'),
      file.text,
      `${file.path} is stale: run npm run kit-ui-tokens`,
    );
  }
});

test('every solid colour of the studio is a kit token with the same value in light and in dark', () => {
  for (const theme of ['light', 'dark'] as const) {
    const tokens = themeTokens(theme);
    for (const [name, hex] of Object.entries(THEME_COLORS[theme])) {
      const key = name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
      assertColor(tokens.get(`color.${key}`), hex, `${theme} color.${key}`);
    }
    assertColor(tokens.get('color.accent'), ACCENT_COLORS.copper[theme].accent, `${theme} accent`);
    assertColor(tokens.get('color.onAccent'), ACCENT_COLORS.copper[theme].on, `${theme} onAccent`);
    assertColor(tokens.get('color.select'), ACCENT_COLORS.copper.select, `${theme} select`);
  }
});

test("the kit has the eight themes of C2 and each accent's themes carry the studio's accent", () => {
  const found = files.flatMap((file) => /tokens\.([a-z-]+)\.json$/.exec(file.path)?.[1] ?? []);
  const ids = ['light', ...found];
  assert.deepEqual(ids, THEME_IDS);
  for (const id of THEME_IDS) {
    const { theme, accent } = parts(id);
    const tokens = themeTokens(id);
    const own = ACCENT_COLORS[accent][theme];
    assertColor(tokens.get('color.accent'), own.accent, `${id} accent`);
    assertColor(tokens.get('color.onAccent'), own.on, `${id} onAccent`);
    assertColor(tokens.get('color.select'), ACCENT_COLORS[accent].select, `${id} select`);
  }
});

test('the dark locals are set under every dark theme', () => {
  const scss = fileText(`${KIT}/scss/core/_studio.scss`);
  assert.deepEqual(DARK_THEMES, ['dark', 'dark-teal', 'dark-coral', 'dark-rose']);
  for (const id of DARK_THEMES) {
    assert.ok(scss.includes(`[data-opt-theme="${id}"]`), `no rule for ${id}`);
  }
  for (const name of ['pop', 'low', 'island', 'pressed', 'frame']) {
    assert.ok(scss.includes(`--_shadow-${name}:`), `--_shadow-${name} is not set`);
  }
  assert.ok(scss.includes('--_ease-out:'));
  assert.doesNotMatch(scss, /--st-/);
});

test("the kit's icons are the studio's", () => {
  const text = fileText(`${KIT}/tsx/display/icon-paths.ts`);
  const names = [...text.matchAll(/^ {2}'([^']+)': \[$/gm)].map((match) => match[1]);
  assert.deepEqual(names, Object.keys(ICONS));
  assert.equal(names.length, 62);
});

test('the added steps add no colour', () => {
  const colors = [
    'canvas panel raised raisedStrong pressed pop line lineStrong ink inkMid inkSoft fix review good',
    'fixSoft reviewSoft goodSoft accent onAccent accentSoft onTone select onSelect frameEdge veil',
    'swatchCopper swatchTeal swatchCoral swatchRose focus',
  ]
    .join(' ')
    .split(' ');
  const inverse = [
    'canvas ink inkMid inkSoft panel raised raisedStrong pressed line',
    'accent onAccent accentSoft',
  ]
    .join(' ')
    .split(' ');
  for (const file of files.filter((one) => one.path.endsWith('.json'))) {
    for (const path of flat(JSON.parse(file.text)).keys()) {
      const [group, name = ''] = path.split('.');
      if (group === 'color') assert.ok(colors.includes(name), `${file.path}: color.${name}`);
      if (group === 'inverse') assert.ok(inverse.includes(name), `${file.path}: inverse.${name}`);
    }
  }
  const base = [...flat(JSON.parse(fileText(`${KIT}/json/tokens.json`))).keys()];
  assert.equal(base.filter((path) => path.startsWith('color.')).length, colors.length);
  assert.equal(base.filter((path) => path.startsWith('inverse.')).length, inverse.length);
});
