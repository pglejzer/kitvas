// Use cases: the waivers of a draft (spec 4c, goal 6; ADR 0055). `waivers.json` sits beside
// `draft.json` and is the only file here; ids in it are as the waiver's own version named them, and
// the rename log (`app/rename-log.ts`) brings them to a later version.

import { KitvasError } from '../../shared/index.ts';
import { latestVersion } from '../domain/draft.ts';
import {
  carried,
  type DraftWaiver,
  MAX_WAIVERS,
  parseWaivers,
  type RenameLike,
  sameKey,
  WAIVERS_FILE,
  type WaiverKey,
  waiversText,
} from '../domain/waivers.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';
import { readRenames } from './rename-log.ts';

/** The stored waivers, oldest first. A file that is missing or does not read holds none. */
export function readWaivers(store: DraftStore, slug: string): DraftWaiver[] {
  try {
    return parseWaivers(store.readJson(slug, WAIVERS_FILE));
  } catch {
    // Not JSON: a waiver only lowers the count of what must be fixed, so it never stops a check.
    return [];
  }
}

/** One version's rename steps, read once per call. */
function stepReader(store: DraftStore, slug: string): (version: number) => readonly RenameLike[] {
  const cache = new Map<number, readonly RenameLike[]>();
  return (version) => {
    const known = cache.get(version);
    if (known) return known;
    const steps = readRenames(store, slug, version);
    cache.set(version, steps);
    return steps;
  };
}

/**
 * The waivers as `version` names their elements. A waiver made on a later version is left out.
 * With `exists`, a waiver whose element is gone from `version` is left out too: it carries only
 * while its element does.
 */
export function waiversFor(
  store: DraftStore,
  slug: string,
  version: number,
  exists?: (element: string) => boolean,
): DraftWaiver[] {
  const stepsOf = stepReader(store, slug);
  return readWaivers(store, slug)
    .filter((waiver) => waiver.version <= version)
    .map((waiver) => carried(waiver, version, stepsOf))
    .filter((waiver) => waiver.element === null || exists === undefined || exists(waiver.element));
}

export type WaiverAccept = WaiverKey & { reason: string };

/**
 * Accepts a finding: a waiver for this rule on this element (as the latest version names it)
 * replaces an earlier one of the same finding. Answers the waivers as the latest version names
 * them. Throws `WAIVER_LIMIT` when the file is full.
 */
export function acceptWaiver(
  store: DraftStore,
  slug: string,
  request: WaiverAccept,
  now: Date,
): DraftWaiver[] {
  const version = latestVersion(loadDraft(store, slug));
  const stepsOf = stepReader(store, slug);
  const kept = readWaivers(store, slug).filter(
    (waiver) => !sameKey(carried(waiver, version, stepsOf), request),
  );
  if (kept.length >= MAX_WAIVERS) throw new KitvasError('WAIVER_LIMIT', { max: MAX_WAIVERS });
  const waiver: DraftWaiver = {
    rule: request.rule,
    element: request.element,
    reason: request.reason.trim(),
    version,
    at: now.toISOString(),
  };
  store.writeText(slug, WAIVERS_FILE, waiversText([...kept, waiver]));
  return waiversFor(store, slug, version);
}

/** Takes a waiver back. The rest are answered as the latest version names them. */
export function withdrawWaiver(store: DraftStore, slug: string, key: WaiverKey): DraftWaiver[] {
  const version = latestVersion(loadDraft(store, slug));
  const stepsOf = stepReader(store, slug);
  const stored = readWaivers(store, slug);
  const kept = stored.filter((waiver) => !sameKey(carried(waiver, version, stepsOf), key));
  if (kept.length !== stored.length) store.writeText(slug, WAIVERS_FILE, waiversText(kept));
  return waiversFor(store, slug, version);
}
