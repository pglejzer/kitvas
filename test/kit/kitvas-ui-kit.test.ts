import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { cssVarName, type FlatToken, requireKit } from '../../src/kit/index.ts';
import { PLUGIN_ROOT, resolveDep } from '../../src/shared/index.ts';
import { FONT_FACES, FONT_PACKAGE } from '../../src/studio/pages/fonts.ts';
import { contrastRatio, laidOver } from '../../src/studio/theme/contrast.ts';

const dir = join(PLUGIN_ROOT, 'kits', 'kitvas-ui');
const read = (...parts: string[]): string => readFileSync(join(dir, ...parts), 'utf8');
const ui = requireKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'kitvas-ui');

const COMPONENTS = [
  'Button',
  'IconButton',
  'Link',
  'Text',
  'Heading',
  'Kbd',
  'Stack',
  'Grid',
  'Card',
  'Island',
  'Group',
  'Row',
  'Separator',
  'Bar',
  'Inverse',
  'Input',
  'Textarea',
  'Search',
  'Select',
  'DateField',
  'Stepper',
  'Checkbox',
  'Radio',
  'Switch',
  'Slider',
  'SegmentedControl',
  'Tabs',
  'Nav',
  'Menu',
  'Breadcrumbs',
  'Pagination',
  'Dialog',
  'Popover',
  'Tooltip',
  'Toast',
  'Alert',
  'Icon',
  'Badge',
  'Chip',
  'Pill',
  'Count',
  'Dot',
  'Swatch',
  'Avatar',
  'Table',
  'Progress',
  'EmptyState',
];

const THEMES = [
  'light',
  'dark',
  'light-teal',
  'dark-teal',
  'light-coral',
  'dark-coral',
  'light-rose',
  'dark-rose',
];

test('the kitvas UI kit is valid and has its 47 components', () => {
  assert.deepEqual(ui.issues, []);
  assert.equal(COMPONENTS.length, 47);
  assert.deepEqual(
    ui.kit.components.map((component) => component.name).sort(),
    [...COMPONENTS].sort(),
  );
  assert.equal(ui.themes.default, 'light');
  assert.deepEqual(
    ui.themes.list.map((theme) => theme.id),
    THEMES,
  );
});

test('every catalog component has a source file, an export and an example that uses it', () => {
  const index = read('tsx', 'index.ts');
  const problems: string[] = [];
  for (const component of ui.kit.components) {
    const { name, category } = component;
    const file = `tsx/${category}/${name}.tsx`;
    if (!existsSync(join(dir, file))) problems.push(`${name}: no ${file}`);
    if (!new RegExp(`\\b${name}\\b[^;]*from './${category}/${name}\\.tsx'`).test(index)) {
      problems.push(`${name}: not exported from tsx/index.ts`);
    }
    if (component.examples.length < 2) problems.push(`${name}: fewer than two examples`);
    for (const example of component.examples) {
      if (!example.code.includes(`<${name}`)) {
        problems.push(`${name}: "${example.title}" does not use it`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("styles use only custom properties that are tokens or the kit's locals", () => {
  const tokens = new Set(ui.tokens.map((token) => cssVarName(token.path)));
  const studio = read('scss', 'core', '_studio.scss');
  const unknown = new Set<string>();
  const files = readdirSync(join(dir, 'scss'), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.scss'))
    .map((file) => file.replaceAll('\\', '/'));
  assert.ok(files.length > 1);
  for (const file of files) {
    const text = read('scss', file);
    for (const match of text.matchAll(/--kit-[a-z0-9-]+/g)) {
      if (!tokens.has(match[0])) unknown.add(`${file}: ${match[0]}`);
    }
    // A shadow or the easing curve is written once, in the generated partial.
    for (const match of text.matchAll(/--_(?:shadow-[a-z]+|ease-out)\b/g)) {
      if (!studio.includes(`${match[0]}:`)) unknown.add(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual([...unknown], []);
});

test('the icon names of the catalog are the icons that are drawn', async () => {
  const drawn = (await import(
    pathToFileURL(join(dir, 'tsx', 'display', 'icon-paths.ts')).href
  )) as {
    ICON_NAMES: string[];
  };
  assert.ok(ui.kit.icons?.source === 'component');
  assert.deepEqual([...drawn.ICON_NAMES].sort(), [...ui.kit.icons.names].sort());
  const nameProp = ui.kit.components
    .find((component) => component.name === 'Icon')
    ?.props.find((prop) => prop.name === 'name');
  assert.deepEqual(nameProp?.values, ui.kit.icons.names);
});

test('components and styles sit in a folder per category, never loose', () => {
  const categories = new Set<string>(ui.kit.components.map((component) => component.category));
  const problems: string[] = [];
  const entries = { tsx: 'index.ts', scss: 'index.scss' };
  for (const [folder, entry] of Object.entries(entries)) {
    for (const item of readdirSync(join(dir, folder), { withFileTypes: true })) {
      if (item.isFile() && item.name !== entry) problems.push(`${folder}/${item.name} is loose`);
      if (item.isDirectory() && item.name !== 'core' && !categories.has(item.name)) {
        problems.push(`${folder}/${item.name}/ is not a category`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('the font files are the ones the studio serves', () => {
  for (const { file } of FONT_FACES) {
    const served = readFileSync(resolveDep(`${FONT_PACKAGE}/files/${file}`, [PLUGIN_ROOT]));
    assert.ok(
      readFileSync(join(dir, 'fonts', file)).equals(served),
      `${file} is the studio's file`,
    );
  }
});

type Paint = { hex: string; alpha: number };

const byte = (part: number): string =>
  Math.round(part * 255)
    .toString(16)
    .padStart(2, '0');

function paintOf(token: FlatToken | undefined): Paint | undefined {
  if (token?.type !== 'color') return undefined;
  const [red, green, blue] = token.value.components;
  return {
    hex: token.value.hex ?? `#${byte(red)}${byte(green)}${byte(blue)}`,
    alpha: token.value.alpha ?? 1,
  };
}

// The kit's colour pairs (`kits/kitvas-ui/AGENTS.md`). A component may sit on any ground in any
// theme, so each pair is measured on every ground it is allowed on.
const GROUNDS = ['canvas', 'panel', 'raised', 'pop'];
const FILLS = ['raised', 'raisedStrong', 'pressed'];
const TONES = ['fix', 'review', 'good'];
const TEXT = 4.5;
const MARK = 3;

test("the kit's colour pairs read in every theme: text 4.5 to 1, a mark 3 to 1", () => {
  const problems: string[] = [];
  for (const theme of THEMES) {
    const own = new Map(
      [...ui.tokens, ...(ui.themeTokens[theme] ?? [])].map((token): [string, FlatToken] => [
        token.path.join('.'),
        token,
      ]),
    );
    const paint = (name: string): Paint => {
      const found = paintOf(own.get(name.includes('.') ? name : `color.${name}`));
      assert.ok(found, `${theme}: ${name} is a colour token`);
      return found;
    };
    const hex = (name: string): string => paint(name).hex;
    // A soft fill is a tone with an alpha, laid over what is under it.
    const soft = (name: string, under: string): string => {
      const laid = laidOver(hex(name), paint(name).alpha, hex(under));
      assert.ok(laid, `${theme}: ${name} lies on ${under}`);
      return laid;
    };
    const check = (least: number, what: string, front: string, behind: string): void => {
      const value = contrastRatio(front, behind);
      if (value === null || value < least)
        problems.push(`${theme}: ${what} is ${value?.toFixed(2)}`);
    };
    const under = [...new Set([...GROUNDS, ...FILLS])];

    for (const ground of under) {
      check(TEXT, `ink on ${ground}`, hex('ink'), hex(ground));
      check(TEXT, `inkMid on ${ground}`, hex('inkMid'), hex(ground));
      check(MARK, `the accent as a mark on ${ground}`, hex('accent'), hex(ground));
      const accentSoft = soft('accentSoft', ground);
      check(TEXT, `ink on accentSoft over ${ground}`, hex('ink'), accentSoft);
      check(MARK, `the accent as a mark on accentSoft over ${ground}`, hex('accent'), accentSoft);
      for (const tone of TONES) {
        const toneSoft = soft(`${tone}Soft`, ground);
        check(TEXT, `ink on ${tone}Soft over ${ground}`, hex('ink'), toneSoft);
        check(MARK, `${tone} as a mark on ${ground}`, hex(tone), hex(ground));
        check(MARK, `${tone} as a mark on ${tone}Soft over ${ground}`, hex(tone), toneSoft);
      }
    }
    for (const ground of GROUNDS) {
      check(TEXT, `fix as text on ${ground}`, hex('fix'), hex(ground));
      check(TEXT, `good as text on ${ground}`, hex('good'), hex(ground));
    }
    check(TEXT, 'onAccent on accent', hex('onAccent'), hex('accent'));
    for (const tone of TONES) check(TEXT, `onTone on ${tone}`, hex('onTone'), hex(tone));
    check(TEXT, 'inverse ink on its canvas', hex('inverse.ink'), hex('inverse.canvas'));
    check(TEXT, 'inverse inkMid on its canvas', hex('inverse.inkMid'), hex('inverse.canvas'));
    check(TEXT, 'inverse ink on its pressed', hex('inverse.ink'), hex('inverse.pressed'));
    check(TEXT, 'inverse ink on its panel', hex('inverse.ink'), hex('inverse.panel'));
  }
  assert.deepEqual(problems, []);
});

// Why the accent and `review` never colour text: on a ground other than the panel they fall under
// 4.5 to 1 in some theme. The day this stops being true, the rule in AGENTS.md may be loosened.
test('the accent as text would fail on a ground in some theme, so the kit never uses it', () => {
  const light = new Map(
    ui.tokens.map((token): [string, FlatToken] => [token.path.join('.'), token]),
  );
  const accent = paintOf(light.get('color.accent'));
  const canvas = paintOf(light.get('color.canvas'));
  assert.ok(accent && canvas);
  const value = contrastRatio(accent.hex, canvas.hex);
  assert.ok(value !== null && value < TEXT, `the accent on the canvas is ${value?.toFixed(2)}`);
});
