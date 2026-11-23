// Tokens as CSS custom properties. Prototype styles use these `--kit-*` names only.

import type { KitIssue } from './issues.ts';
import type { FlatToken } from './tokens.ts';

const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase();

export const cssVarName = (path: string[]): string => `--kit-${path.map(kebab).join('-')}`;

/** A custom property of the design system that a token may stand for: `--brand-ink`. */
export const CSS_VAR_NAME = /^--[A-Za-z0-9_-]+$/;

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

/**
 * The token sheet. `map` (token path with dots -> native variable, `LoadedKit.cssVarMap`) makes a
 * token follow the design system's own variable: `--kit-color-ink: var(--acme-ink);`, so the
 * system's theme stays the one source of the value. A name that is not a custom property is ignored.
 */
export function tokensToCss(
  tokens: FlatToken[],
  selector = ':root',
  map: Record<string, string> = {},
): string {
  const lines = tokens.map((token) => {
    const native = map[token.path.join('.')];
    const value =
      native !== undefined && CSS_VAR_NAME.test(native)
        ? `var(${native})`
        : formatTokenValue(token);
    return `  ${cssVarName(token.path)}: ${value};`;
  });
  return [`${selector} {`, ...lines, '}', ''].join('\n');
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
    if (typeof value !== 'string' || !CSS_VAR_NAME.test(value)) {
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
