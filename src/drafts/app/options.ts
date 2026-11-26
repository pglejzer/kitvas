// Use cases around options.json (plan 25): reading it in one place, checking it, and changing
// which value of each option is the default.

import {
  type DraftOption,
  type Issue,
  KitvasError,
  type OptionChoice,
  pickChoice,
} from '../../shared/index.ts';
import { versionFolder } from '../domain/names.ts';
import { optionsIssues, parseOptions } from '../domain/options.ts';
import type { DraftStore } from '../ports/draft-store.ts';

const optionsPath = (base: string): string => `${base}/src/json/options.json`;

/** The file's parsed text: `undefined` when it is missing, `null` when it is not JSON. */
function readRaw(store: DraftStore, slug: string, base: string): unknown {
  try {
    return store.readJson(slug, optionsPath(base));
  } catch (error) {
    if (error instanceof KitvasError) return null;
    throw error;
  }
}

/**
 * The options of one version folder (`v<N>`). Empty for a missing file and for one that does not
 * read: the render, the checks, the studio and hand-off all read options here, and only here.
 */
export function readOptions(store: DraftStore, slug: string, base: string): DraftOption[] {
  return parseOptions(readRaw(store, slug, base));
}

/** The problems of the version's options file; `themes` are the ids of the kit's themes. */
export function checkOptions(
  store: DraftStore,
  slug: string,
  base: string,
  themes: readonly string[],
): Issue[] {
  return optionsIssues(readRaw(store, slug, base), themes);
}

const DEFAULT_KEY = /("default"\s*:\s*")([^"]*)(")/g;

/**
 * Makes the values of `choice` the defaults of a version's options. Only the `default` values that
 * change are rewritten, in place, so the rest of the file keeps its formatting. An id or a value
 * the version does not have changes nothing. Writes the file when it changed and returns both texts.
 */
export function setOptionDefaults(
  store: DraftStore,
  slug: string,
  version: number,
  choice: OptionChoice,
): { file: string; before: string; after: string } {
  const base = versionFolder(version);
  const file = optionsPath(base);
  const before = store.readText(slug, file);
  const options = readOptions(store, slug, base);
  // The `default` keys come once per option, in the options' order: a value is never a key.
  const found = before === undefined ? [] : [...before.matchAll(DEFAULT_KEY)];
  if (before === undefined || options.length === 0 || found.length !== options.length) {
    throw new KitvasError('DRAFT_INVALID', { slug, detail: file });
  }
  const next = pickChoice(options, choice);
  let after = '';
  let at = 0;
  for (const [index, match] of found.entries()) {
    const [, open = '', current = ''] = match;
    const start = (match.index ?? 0) + open.length;
    const id = options[index]?.id ?? '';
    after += before.slice(at, start) + (next[id] ?? current);
    at = start + current.length;
  }
  after += before.slice(at);
  if (after !== before) store.writeText(slug, file, after);
  return { file, before, after };
}
