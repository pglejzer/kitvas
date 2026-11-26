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
