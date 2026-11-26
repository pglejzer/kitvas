// Themes of a kit and the project's tokens (ADR 0083). `tokens.themes` in kit.json lists the
// kit's themes: the default one is the base token file; any other one may name a file with only
// the tokens whose values differ, at the base's paths and types. The project's additions folder
// (`.kitvas/additions/<kit>/`) may hold `tokens.json`, new tokens, and `tokens.<theme>.json`, the
// values of one theme; a theme id the kit lacks is a new theme. An addition never changes a value
// of the kit. Every file is laid on the base token by token, so a token keeps the `$type` of its
// base group and may point at a base token, and a base token that points at a changed one follows.

import { isRecord, OPTION_VALUE } from '../../shared/index.ts';
import type { Kit } from './contract.ts';
import { formatTokenValue } from './css-vars.ts';
import type { KitIssue } from './issues.ts';
import { type FlatToken, flattenTokens, tokenPaths } from './tokens.ts';

export type KitTheme = {
  id: string;
  label: string;
  /** The theme, or one of its values, comes from the project's additions. */
  added: boolean;
  /** Set on `<body>` while the theme shows; `{}` for the default theme. */
  attributes: Record<string, string>;
};

/** The themes of a loaded kit; `list` is empty for a kit without themes. */
export type KitThemes = { default: string; list: KitTheme[] };

/** The default theme of a kit whose kit.json names no themes, once the project adds one. */
export const BASE_THEME = 'default';

/** The project's new tokens, in the kit's additions folder. */
export const ADDED_TOKENS_FILE = 'tokens.json';

/** The values of one theme in the kit's additions folder: `tokens.dark.json`. */
const THEME_FILE = /^tokens\.(.+)\.json$/;

export type TokenLayers = {
  kit: Kit;
  /** The parsed base token file; `undefined` when it is missing. */
  base: unknown;
  /** The tokens of `base`; its problems are the caller's. */
  baseTokens: FlatToken[];
  /** The kit's theme files by theme id: `undefined` when missing, `null` when not JSON. */
  themeFiles: Readonly<Record<string, unknown>>;
  /** The token files of the project's additions by file name; `null` for one that is not JSON. */
  additions: Readonly<Record<string, unknown>>;
  /** The additions folder from the project's root, which the issues name: `.kitvas/additions/tiny`. */
  additionsAt: string;
};

export type LaidTokens = {
  /** The base tokens, then the project's new ones. */
  tokens: FlatToken[];
  themes: KitThemes;
  /** Per theme id, the tokens whose values differ from `tokens`; `[]` for the default theme. */
  themeTokens: Record<string, FlatToken[]>;
  /** Dot paths of the tokens the project added (`tokens.json`). */
  addedTokens: string[];
  issues: KitIssue[];
};

/** A theme as it is laid: its tree, and which file brought each token it sets. */
type Layer = { theme: KitTheme; tree: unknown; brought: Map<string, string> };

const dotPath = (token: FlatToken): string => token.path.join('.');
const capital = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

/** A parsed token file: an object of groups and tokens, not one token. */
const isTokenFile = (raw: unknown): raw is Record<string, unknown> =>
  isRecord(raw) && !('$value' in raw);

const notTokens = (file: string): KitIssue => ({
  path: file,
  key: 'kitIssue.tokensFile',
  params: { file },
});

/**
 * `over` laid on `base`: a token of `over` whose path `keep` holds takes the place of the one at
 * its path and keeps that one's other keys, its `$type` among them; a group is laid key by key, and
 * a `$` key of a group stays the base's. Built from entries, so no key reaches a prototype.
 */
function lay(
  base: unknown,
  over: Record<string, unknown>,
  keep: ReadonlySet<string>,
  path: readonly string[] = [],
): Record<string, unknown> {
  const tree = new Map<string, unknown>(isRecord(base) ? Object.entries(base) : []);
  for (const [key, child] of Object.entries(over)) {
    if (key.startsWith('$')) {
      if (!tree.has(key)) tree.set(key, child);
      continue;
    }
    if (!isRecord(child)) continue;
    const at = [...path, key];
    const there = tree.get(key);
    if (!('$value' in child)) tree.set(key, lay(there, child, keep, at));
    else if (keep.has(at.join('.'))) {
      const own = isRecord(there) ? Object.entries(there) : [];
      tree.set(key, Object.fromEntries([...own, ...Object.entries(child)]));
    }
  }
  return Object.fromEntries(tree);
}

type Laid = { tree: Record<string, unknown>; taken: Set<string>; issues: KitIssue[] };

/**
 * Lays the tokens of one file on `tree`. `refusal` gives the message key of a token the file may
 * not set, which is left out with an issue at the file, and `undefined` for one it may.
 */
function layFile(
  tree: unknown,
  raw: Record<string, unknown>,
  file: string,
  refusal: (path: string) => string | undefined,
  params: KitIssue['params'] = {},
): Laid {
  const taken = new Set<string>();
  const issues: KitIssue[] = [];
  for (const path of tokenPaths(raw)) {
    const key = refusal(path);
    if (key === undefined) taken.add(path);
    else issues.push({ path: file, key, params: { ...params, path, file } });
  }
  return { tree: lay(tree, raw, taken), taken, issues };
}

/** The token problems of the paths `files` brought (path to file), each at the file that did. */
function routed(found: readonly KitIssue[], files: ReadonlyMap<string, string>): KitIssue[] {
  return found.flatMap((issue) => {
    const file = files.get(String(issue.params.path));
    return file === undefined ? [] : [{ ...issue, path: file, params: { ...issue.params, file } }];
  });
}

/** Whether a new token at `path` meets the kit's: the same path, a group of it, or inside it. */
function clashes(path: string, paths: ReadonlySet<string>): boolean {
  if (paths.has(path)) return true;
  for (const other of paths) {
    if (other.startsWith(`${path}.`) || path.startsWith(`${other}.`)) return true;
  }
  return false;
}

/** What the schema cannot say of `tokens.themes`: one entry an id, the default among them, plain. */
function listIssues(themes: NonNullable<Kit['tokens']['themes']>): KitIssue[] {
  const issues: KitIssue[] = [];
  const seen = new Set<string>();
  for (const theme of themes.list) {
    const params = { theme: theme.id };
    if (seen.has(theme.id)) {
      issues.push({ path: 'tokens.themes.list', key: 'kitIssue.themeTwice', params });
    }
    seen.add(theme.id);
    const own = theme.file !== undefined || Object.keys(theme.attributes ?? {}).length > 0;
    if (theme.id === themes.default && own) {
      issues.push({ path: `tokens.themes.${theme.id}`, key: 'kitIssue.themeDefaultFile', params });
    }
  }
  if (!seen.has(themes.default)) {
    issues.push({
      path: 'tokens.themes.default',
      key: 'kitIssue.themeDefault',
      params: { theme: themes.default },
    });
  }
  return issues;
}

/** The tokens of a theme whose values differ from the base, and the problems of its files. */
function differing(
  layer: Layer | undefined,
  byPath: ReadonlyMap<string, FlatToken>,
): { tokens: FlatToken[]; issues: KitIssue[] } {
  if (layer === undefined || layer.brought.size === 0) return { tokens: [], issues: [] };
  const flat = flattenTokens(layer.tree);
  const issues = routed(flat.issues, layer.brought);
  const tokens: FlatToken[] = [];
  for (const token of flat.tokens) {
    const path = dotPath(token);
    const before = byPath.get(path);
    if (before === undefined) continue;
    if (before.type === token.type) {
      if (formatTokenValue(token) !== formatTokenValue(before)) tokens.push(token);
      continue;
    }
    const file = layer.brought.get(path);
    if (file === undefined) continue;
    issues.push({
      path: file,
      key: 'kitIssue.themeTokenType',
      params: { path, file, type: token.type, baseType: before.type },
    });
  }
  return { tokens, issues };
}

/**
 * The kit's tokens with the project's, and its themes with theirs. Whatever a file may not set is
 * left out with an issue that names the file; the rest of the kit loads as it would without it.
 */
export function layTokens(input: TokenLayers): LaidTokens {
  const declared = input.kit.tokens.themes;
  const defaultId = declared?.default ?? BASE_THEME;
  const issues: KitIssue[] = declared === undefined ? [] : listIssues(declared);
  const kitPaths = new Set(tokenPaths(input.base));
  const at = (name: string): string => `${input.additionsAt}/${name}`;

  // The project's new tokens join the base, so a theme may give them values too.
  let base: unknown = input.base;
  let tokens = input.baseTokens;
  let addedTokens: string[] = [];
  const added = input.additions[ADDED_TOKENS_FILE];
  if (added !== undefined) {
    const file = at(ADDED_TOKENS_FILE);
    if (!isTokenFile(added)) issues.push(notTokens(file));
    else {
      const laid = layFile(base, added, file, (path) =>
        clashes(path, kitPaths) ? 'kitIssue.additionTokenTaken' : undefined,
      );
      issues.push(...laid.issues);
      if (laid.taken.size > 0) {
        base = laid.tree;
        const flat = flattenTokens(base);
        const from = new Map([...laid.taken].map((path): [string, string] => [path, file]));
        issues.push(...routed(flat.issues, from));
        tokens = flat.tokens;
        const found = new Set(tokens.map(dotPath));
        addedTokens = [...laid.taken].filter((path) => found.has(path));
      }
    }
  }
  const basePaths = new Set(tokenPaths(base));

  // The kit's own themes: a theme file sets only the kit's tokens, laid on the project's as well,
  // which may point at them.
  const list: KitTheme[] = [];
  const layers = new Map<string, Layer>();
  for (const own of declared?.list ?? []) {
    if (list.some((theme) => theme.id === own.id)) continue;
    const theme: KitTheme = {
      id: own.id,
      label: own.label,
      added: false,
      attributes: own.attributes ?? {},
    };
    list.push(theme);
    if (own.id === defaultId) continue;
    const layer: Layer = { theme, tree: base, brought: new Map() };
    layers.set(own.id, layer);
    const file = own.file;
    if (file === undefined) continue;
    const raw = input.themeFiles[own.id];
    if (raw === undefined) {
      issues.push({
        path: `tokens.themes.${own.id}`,
        key: 'kitIssue.fileMissing',
        params: { file },
      });
    } else if (!isTokenFile(raw)) {
      issues.push(notTokens(file));
    } else {
      const laid = layFile(base, raw, file, (path) =>
        kitPaths.has(path) ? undefined : 'kitIssue.themeTokenUnknown',
      );
      issues.push(...laid.issues);
      layer.tree = laid.tree;
      for (const path of laid.taken) layer.brought.set(path, file);
    }
  }

  // The project's values of a theme, after the kit's own; a theme the kit lacks is a new one.
  for (const [name, raw] of Object.entries(input.additions)) {
    if (name === ADDED_TOKENS_FILE) continue;
    const file = at(name);
    const id = THEME_FILE.exec(name)?.[1];
    if (id === undefined || !OPTION_VALUE.test(id)) {
      issues.push({ path: file, key: 'kitIssue.additionTokensName', params: { file } });
      continue;
    }
    if (id === defaultId) {
      issues.push({
        path: file,
        key: 'kitIssue.additionDefaultTheme',
        params: { file, theme: id },
      });
      continue;
    }
    if (!isTokenFile(raw)) {
      issues.push(notTokens(file));
      continue;
    }
    let layer = layers.get(id);
    if (layer === undefined) {
      const theme: KitTheme = { id, label: capital(id), added: true, attributes: {} };
      list.push(theme);
      layer = { theme, tree: base, brought: new Map() };
      layers.set(id, layer);
    }
    // What the kit's own theme file sets.
    const kitSets = new Set(layer.brought.keys());
    const laid = layFile(
      layer.tree,
      raw,
      file,
      (path) => {
        if (!basePaths.has(path)) return 'kitIssue.themeTokenUnknown';
        return kitSets.has(path) ? 'kitIssue.additionValueSet' : undefined;
      },
      { theme: id },
    );
    issues.push(...laid.issues);
    layer.tree = laid.tree;
    for (const path of laid.taken) layer.brought.set(path, file);
    if (laid.taken.size > 0) layer.theme.added = true;
  }

  // A kit without themes gets its base as the default theme once the project adds one.
  if (declared === undefined && list.length > 0) {
    list.unshift({ id: BASE_THEME, label: capital(BASE_THEME), added: false, attributes: {} });
  }
  const byPath = new Map(tokens.map((token): [string, FlatToken] => [dotPath(token), token]));
  const themeTokens: Record<string, FlatToken[]> = {};
  for (const theme of list) {
    const found = differing(layers.get(theme.id), byPath);
    themeTokens[theme.id] = found.tokens;
    issues.push(...found.issues);
  }
  return { tokens, themes: { default: defaultId, list }, themeTokens, addedTokens, issues };
}
