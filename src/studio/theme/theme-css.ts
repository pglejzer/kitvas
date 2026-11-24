// The studio's tokens as CSS: the `--st-*` custom properties every skin rule reads.
//
// `<html>` carries the person's choices (`pages/shell.ts`): `data-theme` (absent: follow the
// system), `data-accent` and `data-panels`. An accent has a value per theme, so each accent block
// sets both as raw values and each theme block picks its own; a rule only ever reads
// `--st-color-accent`.

import { withAlpha } from './contrast.ts';
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

/**
 * The token sheet. Light is the base; a dark system picks dark while the person has chosen no
 * theme; `data-theme` overrides both ways.
 */
export function themeCss(): string {
  const accents = ACCENTS.filter((accent) => accent !== DEFAULT_ACCENT).map((accent) =>
    block(`:root[data-accent="${accent}"]`, accentLines(accent)),
  );
  const dark = themeLines('dark');
  return [
    block(':root', [...scaleLines(), ...accentLines(DEFAULT_ACCENT), ...themeLines('light')]),
    ...accents,
    `@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme])', dark)}}\n`,
    block(':root[data-theme="dark"]', dark),
    block(':root[data-theme="light"]', themeLines('light')),
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
