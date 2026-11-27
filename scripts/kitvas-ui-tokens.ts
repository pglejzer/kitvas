// Generates the kitvas UI kit's token files, its style partial of locals and its icon paths from
// the studio's own values (src/studio/theme, src/studio/pages/icons). Run it with
// `npm run kit-ui-tokens`; a guard test fails when the files on disk are stale (plan 27).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_ROOT } from '../src/shared/env/paths.ts';
import { ICONS } from '../src/studio/pages/icons/paths.ts';
import { rgbOf } from '../src/studio/theme/contrast.ts';
import { inverseColors } from '../src/studio/theme/theme-css.ts';
import {
  ACCENT_COLORS,
  ACCENTS,
  type Accent,
  ON_SELECT,
  ON_TONE,
  SCALES,
  SOFT_ALPHA,
  THEME_COLORS,
  THEME_SHADOWS,
  THEME_TINTS,
  type Theme,
} from '../src/studio/theme/tokens.ts';

/** A generated file: its path from the repo root, with "/", and its text. */
export type GeneratedFile = { path: string; text: string };

const KIT = 'kits/kitvas-ui';

/** The command that writes the files, named in each generated header. */
const COMMAND = 'npm run kit-ui-tokens';

/** The kit's themes, in order: each is a theme of the studio with one accent. */
const THEME_TABLE: readonly { id: string; theme: Theme; accent: Accent }[] = [
  { id: 'light', theme: 'light', accent: 'copper' },
  { id: 'dark', theme: 'dark', accent: 'copper' },
  ...ACCENTS.filter((accent) => accent !== 'copper').flatMap((accent) =>
    (['light', 'dark'] as const).map((theme) => ({ id: `${theme}-${accent}`, theme, accent })),
  ),
];

/** The ids of the themes drawn with the studio's dark colours. */
export const DARK_THEMES: readonly string[] = THEME_TABLE.filter(
  (entry) => entry.theme === 'dark',
).map((entry) => entry.id);

/**
 * The kit's own steps: values the studio does not have, added so a product page or a touch screen
 * can be built on the kit. They are not the studio's. A colour is never added here.
 */
export const ADDED = {
  space: { '48': '48px', '64': '64px', '96': '96px' },
  'font-size': { '3xl': '32px', '4xl': '40px', '5xl': '48px' },
  size: { controlMd: '36px', controlLg: '44px', measure: '640px', page: '1200px' },
} as const satisfies Record<string, Record<string, string>>;

/** The token type of each scale group of the studio. */
const SCALE_TYPES = {
  space: 'dimension',
  radius: 'dimension',
  font: 'fontFamily',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'line-height': 'number',
  motion: 'duration',
  size: 'dimension',
} as const;

/** The token groups: a `$type` and the `$value` of each token by name (an alias is a string). */
type Sheet = Record<string, { type: string; tokens: Record<string, unknown> }>;

const camel = (name: string): string =>
  name.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
const round = (n: number): number => Math.round(n * 1000) / 1000;

function color(hex: string, alpha?: number): unknown {
  const rgb = rgbOf(hex);
  if (rgb === null) throw new Error(`not a #rrggbb colour: ${hex}`);
  const components = rgb.map((channel) => round(channel / 255));
  return alpha === undefined
    ? { colorSpace: 'srgb', components }
    : { colorSpace: 'srgb', components, alpha: round(alpha) };
}

function measure(text: string, unit: 'px' | 'ms'): unknown {
  const match = new RegExp(`^(-?\\d+(?:\\.\\d+)?)${unit}$`).exec(text);
  if (match?.[1] === undefined) throw new Error(`not a value in ${unit}: ${text}`);
  return { value: Number(match[1]), unit };
}

function scaleValue(type: (typeof SCALE_TYPES)[keyof typeof SCALE_TYPES], text: string): unknown {
  if (type === 'dimension') return measure(text, 'px');
  if (type === 'duration') return measure(text, 'ms');
  if (type === 'fontFamily') {
    return text.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));
  }
  return Number(text);
}

/** The colour groups of a theme with an accent. */
function colorSheet(theme: Theme, accent: Accent): Sheet {
  const colors = THEME_COLORS[theme];
  const soft = SOFT_ALPHA[theme];
  const own = ACCENT_COLORS[accent][theme];
  const other = theme === 'dark' ? 'light' : 'dark';
  const there = ACCENT_COLORS[accent][other];
  const tokens: Record<string, unknown> = {};
  for (const [name, hex] of Object.entries(colors)) tokens[camel(name)] = color(hex);
  for (const tone of ['fix', 'review', 'good'] as const) {
    tokens[`${tone}Soft`] = color(colors[tone], soft);
  }
  tokens.accent = color(own.accent);
  tokens.onAccent = color(own.on);
  tokens.accentSoft = color(own.accent, soft);
  tokens.onTone = color(ON_TONE[theme]);
  tokens.select = color(ACCENT_COLORS[accent].select);
  tokens.onSelect = color(ON_SELECT);
  for (const [name, [hex, alpha]] of Object.entries(THEME_TINTS[theme])) {
    tokens[camel(name)] = color(hex, alpha);
  }
  for (const name of ACCENTS) {
    tokens[`swatch${name.charAt(0).toUpperCase()}${name.slice(1)}`] = color(
      ACCENT_COLORS[name][theme].accent,
    );
  }
  tokens.focus = '{color.accent}';
  // The inverted scope: the other theme's accent reads on this ground.
  const inverse: Record<string, unknown> = {};
  for (const [name, hex] of Object.entries(inverseColors(theme))) inverse[camel(name)] = color(hex);
  inverse.accent = color(there.accent);
  inverse.onAccent = color(there.on);
  inverse.accentSoft = color(there.accent, SOFT_ALPHA[other]);
  return { color: { type: 'color', tokens }, inverse: { type: 'color', tokens: inverse } };
}

/** The scale groups, the same in every theme: the studio's steps, then the kit's own. */
function scaleSheet(): Sheet {
  const sheet: Sheet = {};
  for (const [group, type] of Object.entries(SCALE_TYPES) as [
    keyof typeof SCALE_TYPES,
    (typeof SCALE_TYPES)[keyof typeof SCALE_TYPES],
  ][]) {
    const tokens: Record<string, unknown> = {};
    const added: Record<string, string> = group in ADDED ? ADDED[group as keyof typeof ADDED] : {};
    for (const [name, text] of [...Object.entries(SCALES[group]), ...Object.entries(added)]) {
      tokens[camel(name)] = scaleValue(type, text);
    }
    sheet[camel(group)] = { type, tokens };
  }
  return sheet;
}

/** A sheet as the JSON tree of a token file. */
function tree(sheet: Sheet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [group, { type, tokens }] of Object.entries(sheet)) {
    const body: Record<string, unknown> = { $type: type };
    for (const [name, value] of Object.entries(tokens)) body[name] = { $value: value };
    out[group] = body;
  }
  return out;
}

/** The tokens of `sheet` whose values differ from `base`; a group with none is left out. */
function differing(sheet: Sheet, base: Sheet): Sheet {
  const out: Sheet = {};
  for (const [group, { type, tokens }] of Object.entries(sheet)) {
    const before = base[group]?.tokens ?? {};
    const changed = Object.entries(tokens).filter(
      ([name, value]) => JSON.stringify(value) !== JSON.stringify(before[name]),
    );
    if (changed.length > 0) out[group] = { type, tokens: Object.fromEntries(changed) };
  }
  return out;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** The local properties of one theme's shadows, for the partial. */
function shadowLines(theme: Theme): string[] {
  return Object.entries(THEME_SHADOWS[theme]).map(
    ([name, value]) =>
      `  --_shadow-${name}: ${value.replaceAll('var(--st-color-', 'var(--kit-color-')};`,
  );
}

function studioScss(): string {
  const selector = DARK_THEMES.map((id) => `[data-opt-theme="${id}"]`).join(',\n');
  return [
    `// Generated by \`${COMMAND}\` from the studio's tokens (src/studio/theme/tokens.ts). Do not edit.`,
    '// Locals of the kit, not tokens: the shadows of each theme and the easing curve.',
    '',
    ':root {',
    ...shadowLines('light'),
    `  --_ease-out: ${SCALES.ease.out};`,
    '}',
    '',
    `${selector} {`,
    ...shadowLines('dark'),
    '}',
    '',
  ].join('\n');
}

type Shape = { tag: string; attrs: Record<string, number | string> };

const ELEMENT = /\s*<([a-z]+)((?:\s+[a-z]+="[^"]*")*)\s*\/>/y;
const ATTRS = { path: ['d'], circle: ['cx', 'cy', 'r'], rect: ['x', 'y', 'width', 'height', 'rx'] };

/** Reads the elements of an icon's markup; throws on any tag or attribute the kit does not draw. */
function parseShapes(name: string, markup: string): Shape[] {
  const shapes: Shape[] = [];
  let at = 0;
  while (at < markup.length) {
    ELEMENT.lastIndex = at;
    const match = ELEMENT.exec(markup);
    if (match?.[1] === undefined) throw new Error(`icon ${name}: cannot read markup at ${at}`);
    const tag = match[1];
    if (!Object.hasOwn(ATTRS, tag)) throw new Error(`icon ${name}: tag ${tag} is not drawn`);
    const allowed = ATTRS[tag as keyof typeof ATTRS];
    const attrs: Record<string, number | string> = {};
    for (const [, key = '', value = ''] of (match[2] ?? '').matchAll(/([a-z]+)="([^"]*)"/g)) {
      if (!allowed.includes(key)) throw new Error(`icon ${name}: ${tag} has attribute ${key}`);
      attrs[key] = key === 'd' ? value : Number(value);
    }
    const required = tag === 'rect' ? allowed.slice(0, 4) : allowed;
    for (const key of required) {
      if (!(key in attrs)) throw new Error(`icon ${name}: ${tag} lacks ${key}`);
    }
    shapes.push({ tag, attrs });
    at = ELEMENT.lastIndex;
  }
  if (shapes.length === 0) throw new Error(`icon ${name}: no shapes`);
  return shapes;
}

const quote = (text: string): string => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

function shapeLine({ tag, attrs }: Shape): string {
  const fields = Object.entries(attrs).map(
    ([key, value]) => `${key}: ${typeof value === 'string' ? quote(value) : value}`,
  );
  return `    { tag: ${quote(tag)}, ${fields.join(', ')} },`;
}

function iconPathsTs(): string {
  const entries = Object.entries(ICONS).flatMap(([name, markup]) => [
    `  ${quote(name)}: [`,
    ...parseShapes(name, markup).map(shapeLine),
    '  ],',
  ]);
  return [
    `// Generated by \`${COMMAND}\` from the studio's icons (src/studio/pages/icons/paths.ts). Do not edit.`,
    '',
    'export type IconShape =',
    "  | { tag: 'path'; d: string }",
    "  | { tag: 'circle'; cx: number; cy: number; r: number }",
    "  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx?: number };",
    '',
    'export const ICON_SHAPES = {',
    ...entries,
    '} as const satisfies Record<string, readonly IconShape[]>;',
    '',
    'export type IconName = keyof typeof ICON_SHAPES;',
    '',
    'export const ICON_NAMES = Object.keys(ICON_SHAPES) as IconName[];',
    '',
  ].join('\n');
}

/** Every generated file of the kit, with the text it must hold. */
export function kitvasUiFiles(): GeneratedFile[] {
  const scales = scaleSheet();
  const sheetOf = (entry: (typeof THEME_TABLE)[number]): Sheet => ({
    ...colorSheet(entry.theme, entry.accent),
    ...scales,
  });
  const [first, ...rest] = THEME_TABLE;
  if (first === undefined) throw new Error('no themes');
  const base = sheetOf(first);
  return [
    { path: `${KIT}/json/tokens.json`, text: json(tree(base)) },
    ...rest.map((entry) => ({
      path: `${KIT}/json/tokens.${entry.id}.json`,
      text: json(tree(differing(sheetOf(entry), base))),
    })),
    { path: `${KIT}/scss/core/_studio.scss`, text: studioScss() },
    { path: `${KIT}/tsx/display/icon-paths.ts`, text: iconPathsTs() },
  ];
}

function main(): void {
  for (const file of kitvasUiFiles()) {
    const target = join(PLUGIN_ROOT, ...file.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
    console.log(`${file.path}: written`);
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
