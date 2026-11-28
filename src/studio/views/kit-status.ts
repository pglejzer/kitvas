// Where a kit comes from and whether `kitvas kit verify` still vouches for it, as data.

import type { LookEntry, VerifyFile, VerifyIssue } from '../../checks/index.ts';
import type { KitSource } from '../../kit/index.ts';
import type { Translate } from '../../shared/index.ts';

/** The `studio.kit.source.*` key and its parameters for a kit's source. */
export function sourceLine(source: KitSource): { key: string; params: Record<string, string> } {
  switch (source.type) {
    case 'builtin':
      return { key: 'studio.kit.source.builtin', params: {} };
    case 'npm':
      return {
        key: 'studio.kit.source.npm',
        params: { name: source.package, version: source.version },
      };
    case 'repo':
      return { key: 'studio.kit.source.repo', params: { path: source.path } };
    case 'figma':
      return { key: 'studio.kit.source.figma', params: {} };
    case 'web':
      return { key: 'studio.kit.source.web', params: { host: hostsOf(source.urls) } };
    case 'images':
      return { key: 'studio.kit.source.images', params: {} };
    case 'code':
      return { key: 'studio.kit.source.code', params: { path: source.path } };
  }
}

/** What a kit is made from, as a noun for "Not part of {source}": the package, folder, host or file. */
export function sourceNoun(t: Translate, source: KitSource): string {
  switch (source.type) {
    case 'builtin':
      return t('studio.added.source.builtin');
    case 'npm':
      return source.package;
    case 'repo':
      return source.path;
    case 'figma':
      return t('studio.added.source.figma');
    case 'web':
      return hostsOf(source.urls);
    case 'images':
      return t('studio.added.source.images');
    case 'code':
      return source.path;
  }
}

/** The distinct hosts of the scanned pages, in order; the contract guarantees valid addresses. */
function hostsOf(urls: string[]): string {
  const hosts = urls.map((url) => URL.parse(url)?.host ?? url);
  return [...new Set(hosts)].join(', ');
}

/** The look scores a page may show: none, scores for this kit hash, or scores gone stale. */
export type LookView =
  | { state: 'none' }
  | { state: 'stale' }
  | { state: 'scored'; entries: Record<string, LookEntry> };

export function lookView(file: VerifyFile | undefined, hash: string): LookView {
  if (file?.look === undefined) return { state: 'none' };
  if (file.hash !== hash) return { state: 'stale' };
  return { state: 'scored', entries: Object.fromEntries(file.look.map((e) => [e.key, e])) };
}

/** How a component of a `code` kit was compared with the project it was written from. */
export type CompareLevel = 'app' | 'code' | 'read';
/** Why a component is only `read`: nothing to compare with, styles not compiled, styles not readable. */
export type ReadReason = 'none' | 'notDrawn' | 'partial';
export type ComparedEntry = {
  component: string;
  level: CompareLevel;
  why?: ReadReason | undefined;
};
/** The numbers of one example against its original (C8, `originals` of verify.json). */
export type OriginalEntry = {
  key: string;
  width: number;
  frames: number;
  differences: number;
  score: number;
};
export type OutdatedEntry = { name: string; reason: 'changed' | 'gone' };

/** What a `code` kit's page adds: levels, counts, the originals' numbers and the stale components. */
export type CodeView = {
  /** The level of each component; empty when the kit was not verified as it is now. */
  levels: Record<string, CompareLevel>;
  /** Why a `read` component was not compared. */
  reasons: Record<string, ReadReason>;
  /** Components at each level; `undefined` when there are no levels. */
  counts: Record<CompareLevel, number> | undefined;
  /** The numbers against the original of each example key, one entry a width. */
  originals: Record<string, OriginalEntry[]>;
  outdated: Record<string, OutdatedEntry['reason']>;
};

/**
 * The `code` kit's view, or `undefined` for any other kit. Levels appear only for a verification
 * made for the kit as it is now; a component the list does not name counts as `read`.
 */
export function codeView(input: {
  source: KitSource;
  verify: VerifyView;
  components: string[];
  /** The verify file; `hash` makes it a `VerifyFile` before it carries the two lists. */
  file?:
    | {
        hash: string;
        compared?: ComparedEntry[] | undefined;
        originals?: OriginalEntry[] | undefined;
      }
    | undefined;
  outdated?: OutdatedEntry[] | undefined;
}): CodeView | undefined {
  if (input.source.type !== 'code') return undefined;
  const fresh = input.verify.state === 'passed' || input.verify.state === 'failed';
  const compared = fresh ? input.file?.compared : undefined;
  const byName = new Map((compared ?? []).map((entry) => [entry.component, entry]));
  const levels: Record<string, CompareLevel> = {};
  const reasons: Record<string, ReadReason> = {};
  const counts: Record<CompareLevel, number> = { app: 0, code: 0, read: 0 };
  if (compared !== undefined) {
    for (const name of input.components) {
      const level = byName.get(name)?.level ?? 'read';
      levels[name] = level;
      counts[level] += 1;
      if (level === 'read') reasons[name] = byName.get(name)?.why ?? 'none';
    }
  }
  const originals: Record<string, OriginalEntry[]> = {};
  for (const entry of fresh ? (input.file?.originals ?? []) : []) {
    originals[entry.key] = [...(originals[entry.key] ?? []), entry];
  }
  return {
    levels,
    reasons,
    counts: compared === undefined ? undefined : counts,
    originals,
    outdated: Object.fromEntries((input.outdated ?? []).map((entry) => [entry.name, entry.reason])),
  };
}

export type VerifyState = 'passed' | 'failed' | 'stale' | 'never';
export type VerifyView = {
  state: VerifyState;
  /** `YYYY-MM-DD` of the run; empty when there is none. */
  date: string;
  count: number;
  issues: VerifyIssue[];
};

/**
 * What the last `verify.json` says about the kit as it is now. A file made for another hash is
 * `stale` whatever it found: the kit changed since, so neither its pass nor its problems count.
 */
export function verifyView(file: VerifyFile | undefined, hash: string): VerifyView {
  if (file === undefined) return { state: 'never', date: '', count: 0, issues: [] };
  const date = file.at.slice(0, 10);
  if (file.hash !== hash) return { state: 'stale', date, count: 0, issues: [] };
  if (file.valid) return { state: 'passed', date, count: 0, issues: [] };
  return { state: 'failed', date, count: file.issues.length, issues: file.issues };
}
