// Tokens as CSS custom properties. Prototype styles use these `--kit-*` names only.

import { nativeVariable, optionSelector, THEME_OPTION, themePathOf } from '../../shared/index.ts';
import type { KitIssue } from './issues.ts';
import type { FlatToken } from './tokens.ts';

const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase();

export const cssVarName = (path: string[]): string => `--kit-${path.map(kebab).join('-')}`;

/** A `var(--kit-…)` in a file of a written kit's components that no token of the kit gives. */
export type UnknownTokenVar = {
  file: string;
  name: string;
  /** The variable of the token it was meant to be, when its name in kebab case is one. */
  nearest: string | undefined;
};

const KIT_VAR_USE = /var\(\s*(--kit-[A-Za-z0-9_-]+)/g;

/**
 * Each `var(--kit-…)` of `files` (path -> text) that names no token, once a file, in order: the
 * browser leaves such a value unset without a word (`--kit-fontSize-sm` for `--kit-font-size-sm`).
 */
export function unknownTokenVars(
  files: Record<string, string>,
  tokens: readonly FlatToken[],
): UnknownTokenVar[] {
  const known = new Set(tokens.map((token) => cssVarName(token.path)));
  const found: UnknownTokenVar[] = [];
  for (const [file, text] of Object.entries(files)) {
    const named = new Set<string>();
    for (const use of text.matchAll(KIT_VAR_USE)) {
      const name = use[1] ?? '';
      if (known.has(name) || named.has(name)) continue;
      named.add(name);
      const meant = `--kit-${kebab(name.slice('--kit-'.length))}`;
      found.push({ file, name, nearest: known.has(meant) ? meant : undefined });
    }
  }
  return found;
}

/** A custom property of the design system that a token may stand for: `--brand-ink`. */
export const CSS_VAR_NAME = /^--[A-Za-z0-9_-]+$/;

/** What a map may name: a custom property, or a theme path of Tailwind 3 (`theme(colors.primary)`). */
const isMapValue = (value: string): boolean =>
  CSS_VAR_NAME.test(value) || themePathOf(value) !== undefined;

const byte = (part: number): number => Math.round(part * 255);
const hexPair = (part: number): string => byte(part).toString(16).padStart(2, '0');
const quoteFamily = (name: string): string => (/^[A-Za-z-]+$/.test(name) ? name : `"${name}"`);

export function formatTokenValue(token: FlatToken): string {
  switch (token.type) {
    case 'color': {
      const [red, green, blue] = token.value.components;
      const alpha = token.value.alpha ?? 1;
      if (alpha === 1) return `#${hexPair(red)}${hexPair(green)}${hexPair(blue)}`;
      return `rgb(${byte(red)} ${byte(green)} ${byte(blue)} / ${alpha})`;
    }
    case 'dimension':
      return token.value.value === 0 ? '0' : `${token.value.value}${token.value.unit}`;
    case 'duration':
      return `${token.value.value}${token.value.unit}`;
    case 'fontFamily':
      return [token.value].flat().map(quoteFamily).join(', ');
    case 'fontWeight':
    case 'number':
      return String(token.value);
  }
}

/** What the token sheet is written from; `LoadedKit` has it. */
export type SheetTokens = {
  tokens: readonly FlatToken[];
  /** Token path with dots -> native variable (`LoadedKit.cssVarMap`). */
  cssVarMap: Readonly<Record<string, string>>;
  /** Per theme id, the tokens whose values differ (`LoadedKit.themeTokens`). */
  themeTokens: Readonly<Record<string, readonly FlatToken[]>>;
};

/** One rule of the sheet; none for no tokens. */
const rule = (selector: string, lines: string[]): string[] =>
  lines.length === 0 ? [] : [`${selector} {`, ...lines, '}'];

/**
 * The kit's token sheet, the one every build and `kit css` write: the base under `:root`, then each
 * theme's tokens under its value of the option `theme` (`[data-opt-theme="dark"]`, ADR 0083).
 *
 * A token the map names follows the design system's own variable, `--kit-color-ink: var(--acme-ink);`,
 * so the system's theme stays the one source of the value; a name that is not a custom property is
 * ignored. Such a token is declared on the body too (`:root, body`): a `var()` is worked out on the
 * element that declares it, and a theme's attributes, which switch the system's variables, are on
 * the body. A theme's own value of a mapped token is declared on the body as well, or the body's
 * declaration would hide it there.
 */
export function tokenSheet(kit: SheetTokens): string {
  const native = (token: FlatToken): string | undefined => {
    const name = kit.cssVarMap[token.path.join('.')];
    return name !== undefined && isMapValue(name) ? nativeVariable(name) : undefined;
  };
  const declare = (token: FlatToken, value: string): string =>
    `  ${cssVarName(token.path)}: ${value};`;
  const plain = (token: FlatToken): string => declare(token, formatTokenValue(token));
  const free = (tokens: readonly FlatToken[]) => tokens.filter((token) => !native(token));
  const mapped = (tokens: readonly FlatToken[]) => tokens.filter((token) => native(token));
  const lines = [
    ...rule(':root', free(kit.tokens).map(plain)),
    ...rule(
      ':root, body',
      mapped(kit.tokens).map((token) => declare(token, `var(${native(token)})`)),
    ),
  ];
  for (const [id, tokens] of Object.entries(kit.themeTokens)) {
    const at = optionSelector(THEME_OPTION, id);
    lines.push(...rule(at, free(tokens).map(plain)));
    lines.push(...rule(`${at}, ${at} body`, mapped(tokens).map(plain)));
  }
  return lines.length === 0 ? '' : [...lines, ''].join('\n');
}

/**
 * Reads the parsed `tokens.cssVars.map` file: `{ "<token path with dots>": "--native-name" }`.
 * Entries with a problem are left out of `map` and reported.
 */
export function readCssVarMap(
  raw: unknown,
  tokens: FlatToken[],
): { map: Record<string, string>; issues: KitIssue[] } {
  const at = 'tokens.cssVars.map';
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      map: {},
      issues: [{ path: at, key: 'kitIssue.tokenShape', params: { path: at, type: 'cssVars.map' } }],
    };
  }
  const known = new Set(tokens.map((token) => token.path.join('.')));
  const entries: [string, string][] = [];
  const issues: KitIssue[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || !isMapValue(value)) {
      issues.push({
        path: at,
        key: 'kitIssue.tokenShape',
        params: { path: key, type: 'cssVars.map' },
      });
    } else if (!known.has(key)) {
      issues.push({
        path: at,
        key: 'kitIssue.tokenAliasMissing',
        params: { path: value, target: key },
      });
    } else {
      entries.push([key, value]);
    }
  }
  // fromEntries defines own properties, so a key such as "__proto__" cannot reach the prototype.
  return { map: Object.fromEntries(entries), issues };
}
