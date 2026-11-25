// The studio's tokens as CSS: the `--st-*` custom properties every skin rule reads.
//
// `<html>` carries the person's choices (`pages/shell.ts`): `data-theme` (absent: follow the
// system), `data-accent` and `data-panels`. An accent has a value per theme, so each accent block
// sets both as raw values and each theme block picks its own; a rule only ever reads
// `--st-color-accent`.

import { laidOver, withAlpha } from './contrast.ts';
import {
  ACCENT_COLORS,
  ACCENTS,
  type Accent,
  INVERSE_MIX,
  ON_SELECT,
  ON_TONE,
  SCALES,
  SOFT_ALPHA,
  THEME_COLORS,
  THEME_SHADOWS,
  THEME_TINTS,
  THEMES,
  type Theme,
} from './tokens.ts';

/** The accent a page has before the person picks one. */
export const DEFAULT_ACCENT: Accent = 'copper';

const block = (selector: string, lines: string[]): string =>
  `${selector} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n`;

function scaleLines(): string[] {
  return Object.entries(SCALES).flatMap(([group, values]) =>
    Object.entries(values).map(([name, value]) => `--st-${group}-${name}: ${value};`),
  );
}

/** Both themes' values of one accent, under names no rule reads. */
function accentLines(accent: Accent): string[] {
  const colors = ACCENT_COLORS[accent];
  const lines = THEMES.flatMap((theme) => [
    `--st-raw-accent-${theme}: ${colors[theme].accent};`,
    `--st-raw-on-accent-${theme}: ${colors[theme].on};`,
    `--st-raw-accent-soft-${theme}: ${withAlpha(colors[theme].accent, SOFT_ALPHA[theme])};`,
  ]);
  return [...lines, `--st-color-select: ${colors.select};`, `--st-color-on-select: ${ON_SELECT};`];
}

function themeLines(theme: Theme): string[] {
  const soft = SOFT_ALPHA[theme];
  const colors = THEME_COLORS[theme];
  return [
    `color-scheme: ${theme};`,
    ...Object.entries(colors).map(([name, value]) => `--st-color-${name}: ${value};`),
    ...(['fix', 'review', 'good'] as const).map(
      (tone) => `--st-color-${tone}-soft: ${withAlpha(colors[tone], soft)};`,
    ),
    ...Object.entries(THEME_TINTS[theme]).map(
      ([name, [hex, alpha]]) => `--st-color-${name}: ${withAlpha(hex, alpha)};`,
    ),
    `--st-color-on-tone: ${ON_TONE[theme]};`,
    `--st-color-accent: var(--st-raw-accent-${theme});`,
    `--st-color-on-accent: var(--st-raw-on-accent-${theme});`,
    `--st-color-accent-soft: var(--st-raw-accent-soft-${theme});`,
    // The swatches of the View popover: each accent as this theme shows it.
    ...ACCENTS.map((accent) => `--st-swatch-${accent}: ${ACCENT_COLORS[accent][theme].accent};`),
    ...Object.entries(THEME_SHADOWS[theme]).map(
      ([name, value]) => `--st-shadow-${name}: ${value};`,
    ),
  ];
}

/** The colour tokens inside the inverted scope of a theme, as solid `#rrggbb` values. */
export type InverseColors = Record<'canvas' | 'ink' | keyof typeof INVERSE_MIX, string>;

/**
 * The inverted scope (`.k-inverse`) of a theme: the theme's ink is the ground and its panel colour
 * the text, so a block on the page reads as a slab of the other theme. Computed here, not mixed in
 * CSS, so the contrast tests can read the values.
 */
export function inverseColors(theme: Theme): InverseColors {
  const ground = THEME_COLORS[theme].ink;
  const text = THEME_COLORS[theme].panel;
  const over = (name: keyof typeof INVERSE_MIX): string =>
    laidOver(text, INVERSE_MIX[name], ground) ?? ground;
  return {
    canvas: ground,
    ink: text,
    'ink-mid': over('ink-mid'),
    'ink-soft': over('ink-soft'),
    panel: over('panel'),
    raised: over('raised'),
    'raised-strong': over('raised-strong'),
    pressed: over('pressed'),
    line: over('line'),
  };
}

function inverseLines(theme: Theme): string[] {
  const other = theme === 'dark' ? 'light' : 'dark';
  return [
    ...Object.entries(inverseColors(theme)).map(([name, value]) => `--st-color-${name}: ${value};`),
    // The accent is the other theme's, which reads on this ground.
    `--st-color-accent: var(--st-raw-accent-${other});`,
    `--st-color-on-accent: var(--st-raw-on-accent-${other});`,
    `--st-color-accent-soft: var(--st-raw-accent-soft-${other});`,
    '--st-shadow-low: none;',
    '--st-shadow-pressed: none;',
  ];
}

/**
 * The token sheet. Light is the base; a dark system picks dark while the person has chosen no
 * theme; `data-theme` overrides both ways. After each theme's set comes the same set for
 * `.k-inverse` inside it.
 */
export function themeCss(): string {
  const accents = ACCENTS.filter((accent) => accent !== DEFAULT_ACCENT).map((accent) =>
    block(`:root[data-accent="${accent}"]`, accentLines(accent)),
  );
  const dark = themeLines('dark');
  const darkScope = inverseLines('dark');
  const light = themeLines('light');
  const lightScope = inverseLines('light');
  const system = `${block(':root:not([data-theme])', dark)}${block(':root:not([data-theme]) .k-inverse', darkScope)}`;
  return [
    block(':root', [...scaleLines(), ...accentLines(DEFAULT_ACCENT), ...light]),
    block(':root .k-inverse', lightScope),
    ...accents,
    `@media (prefers-color-scheme: dark) {\n${system}}\n`,
    block(':root[data-theme="dark"]', dark),
    block(':root[data-theme="dark"] .k-inverse', darkScope),
    block(':root[data-theme="light"]', light),
    block(':root[data-theme="light"] .k-inverse', lightScope),
  ].join('');
}

/** Every `--st-*` name the sheet defines for rules to read (the raw accent values left out). */
export function themeNames(): Set<string> {
  const names = new Set<string>();
  for (const match of themeCss().matchAll(/(--st-[a-z0-9-]+):/g)) {
    const name = match[1];
    if (name !== undefined && !name.startsWith('--st-raw-')) names.add(name);
  }
  return names;
}
