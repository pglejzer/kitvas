// The Tailwind file of a build, `build/json/tailwind.json` in a draft version or a kit's catalog:
// the classes that made no CSS and what the project's Tailwind says about itself. Written by the
// render builds; read by the makers' context, the hand-off brief, the editor and the checks.

import { isRecord } from './guards.ts';

/**
 * What the project's Tailwind says about itself, read in each build. `prefix` is what a class
 * starts with (`tw-` in v3, `tw:` in v4, `''` for none); `screens` holds the plain min-width
 * screens by name, in px; `aliases` names, for a page variable that a Tailwind 4 theme variable
 * is only a pointer to (`@theme inline { --color-primary: var(--primary) }`), that theme variable
 * (`--primary` → `--color-primary`), and is `{}` in Tailwind 3.
 */
export type TailwindTheme = {
  version: 3 | 4;
  prefix: string;
  screens: Record<string, number>;
  aliases: Record<string, string>;
};

export const TAILWIND_FILE = 'build/json/tailwind.json';

export type TailwindFile = {
  schemaVersion: 2;
  /** Class-like candidates that produced no CSS, sorted. */
  unknown: string[];
  /** The project's Tailwind facts from the same build; null when it reported none. */
  theme: TailwindTheme | null;
};

function themeOf(raw: unknown): TailwindTheme | null {
  if (!isRecord(raw) || typeof raw.prefix !== 'string' || !isRecord(raw.screens)) return null;
  const version = raw.version;
  if (version !== 3 && version !== 4) return null;
  const screens: Record<string, number> = {};
  for (const [name, px] of Object.entries(raw.screens)) {
    if (typeof px === 'number' && Number.isFinite(px)) screens[name] = px;
  }
  const aliases: Record<string, string> = {};
  for (const [page, theme] of Object.entries(isRecord(raw.aliases) ? raw.aliases : {})) {
    if (page.startsWith('--') && typeof theme === 'string' && theme.startsWith('--')) {
      aliases[page] = theme;
    }
  }
  return { version, prefix: raw.prefix, screens, aliases };
}

/** A parsed Tailwind file; `undefined` for anything else, a file of an older version included. */
export function parseTailwindFile(raw: unknown): TailwindFile | undefined {
  if (!isRecord(raw) || raw.schemaVersion !== 2) return undefined;
  const unknown = raw.unknown;
  if (!Array.isArray(unknown) || !unknown.every((name) => typeof name === 'string')) {
    return undefined;
  }
  return { schemaVersion: 2, unknown, theme: themeOf(raw.theme) };
}

/** The Tailwind file of the folder `dir`, read through `read` (its text, or undefined). */
export function readTailwindFile(
  read: (file: string) => string | undefined,
  dir: string,
): TailwindFile | undefined {
  const text = read(`${dir}/${TAILWIND_FILE}`);
  if (text === undefined) return undefined;
  try {
    return parseTailwindFile(JSON.parse(text));
  } catch {
    return undefined;
  }
}
