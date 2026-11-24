// One element followed back through the versions of a draft (spec 4d, goal 5; plan 17, task D;
// ADR 0052). A version starts as a copy of the one before it, and the editor logs every id it
// changes there (`edit/renames.json`), so the log gives the element's id at the version's start,
// which is its id in the version before. Where that does not hold (Claude rewrote the file, so
// the ids moved without a log) the element is matched by tag, JSX path and text, and the step is
// `unsure`. Nothing is written here.

import {
  type DraftStore,
  idAtStart,
  latestVersion,
  loadDraft,
  readRenames,
} from '../../../drafts/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { bestMatch } from '../../domain/identity/match.ts';
import { fileOfId } from '../../domain/ops.ts';
import type { EditCompiler } from '../../ports/compiler.ts';
import { readVersionFile, type VersionElement, type VersionFile } from './version-elements.ts';

export type ElementHistoryDeps = { drafts: DraftStore; compiler: EditCompiler };

/** The shape of the studio's `ElementStepSchema` (`src/studio/api/history/history-schemas.ts`). */
export type ElementStep = {
  version: number;
  /** The element's id in that version; `null` when it was not there. */
  id: string | null;
  /** Its source differs from the version before, or it first appears here. */
  changed: boolean;
  /** The way from the latest version to this one went through a match, or a version not built. */
  unsure: boolean;
};

/** Oldest version first; the same shape as the studio's `ElementHistorySchema`. */
export type ElementHistory = { id: string; steps: ElementStep[] };

type Reader = (version: number, file: string) => Promise<VersionFile | null>;
type Link = { element: VersionElement | null; unsure: boolean };
type Trail = { version: number; element: VersionElement | null; unsure: boolean };

const GONE: Link = { element: null, unsure: false };

/** Each file of each version is read once per call. */
function fileReader(deps: ElementHistoryDeps, slug: string): Reader {
  const cache = new Map<string, Promise<VersionFile | null>>();
  return (version, file) => {
    const key = `${version}\n${file}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const read = readVersionFile(deps, slug, version, file);
    cache.set(key, read);
    return read;
  };
}

/**
 * The element `element` of version `later`, in the version `before` it.
 * - The log says an edit of `later` created it: it was not there.
 * - The id the log leads to names an element with the same source: that one.
 * - It names an element with another source: that one, edited in place. Only when the log said
 *   nothing of the id, and another element of the file has exactly the element's source, that
 *   other one is taken (`unsure`): the ids moved without a log, as after Claude's rewrite.
 * - It names no element: the best match of the file (`unsure`), or none.
 */
async function linkBack(
  deps: ElementHistoryDeps,
  read: Reader,
  slug: string,
  at: { later: number; before: number },
  element: VersionElement,
): Promise<Link> {
  const candidate = idAtStart(readRenames(deps.drafts, slug, at.later), element.id);
  if (candidate === null) return GONE;
  const file = await read(at.before, fileOfId(candidate));
  if (file === null) return GONE;
  const byId = (id: string): VersionElement | null =>
    file.elements.find((each) => each.id === id) ?? null;
  const direct = byId(candidate);
  // A version without a build was placed by a compile made now: said as unsure (plan 17, D1).
  if (direct !== null && direct.source === element.source) {
    return { element: direct, unsure: !file.built };
  }
  const best = bestMatch(element, file.elements);
  if (direct !== null) {
    const silent = candidate === element.id;
    if (silent && best?.exact && best.id !== candidate) {
      return { element: byId(best.id), unsure: true };
    }
    return { element: direct, unsure: !file.built };
  }
  return best === null ? GONE : { element: byId(best.id), unsure: true };
}

/**
 * Where the element `id` of the latest version is in every version of the draft, oldest first.
 * Throws EDIT_ELEMENT_NOT_FOUND when the latest version has no such element.
 */
export async function elementHistory(
  deps: ElementHistoryDeps,
  slug: string,
  id: string,
): Promise<ElementHistory> {
  const draft = loadDraft(deps.drafts, slug);
  const latest = latestVersion(draft);
  const versions = draft.versions.map((entry) => entry.number).sort((a, b) => b - a);
  const read = fileReader(deps, slug);
  const file = await read(latest, fileOfId(id));
  const first = file?.elements.find((each) => each.id === id);
  if (file === null || first === undefined) {
    throw new KitvasError('EDIT_ELEMENT_NOT_FOUND', { slug, version: latest, id });
  }

  // Newest first: each version is reached from the one after it.
  const trail: Trail[] = [{ version: latest, element: first, unsure: !file.built }];
  for (const version of versions.slice(1)) {
    const later = trail[trail.length - 1];
    if (later === undefined) break;
    if (later.element === null) {
      trail.push({ version, element: null, unsure: later.unsure });
      continue;
    }
    const at = { later: later.version, before: version };
    const link = await linkBack(deps, read, slug, at, later.element);
    trail.push({ version, element: link.element, unsure: later.unsure || link.unsure });
  }

  const steps = trail.map((entry, index): ElementStep => {
    const before = trail[index + 1];
    const changed =
      entry.element !== null &&
      before !== undefined &&
      (before.element === null || before.element.source !== entry.element.source);
    return {
      version: entry.version,
      id: entry.element?.id ?? null,
      changed,
      unsure: entry.unsure,
    };
  });
  return { id, steps: steps.reverse() };
}
