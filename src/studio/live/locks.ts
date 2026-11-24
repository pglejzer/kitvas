// Locks after another writer's change (spec 4d, goal 4; plan 17, task C). The live loop hands each
// `source` event here; one of another writer (Claude, or the person in another editor) makes the
// draft's locks be compared with their elements now: the kept source with the element's source,
// whitespace collapsed, so an element moved with its parent is unchanged. A `locks` event tells
// the draft's pages which locked ids changed; the editor then reads `GET …/view`, which answers
// from the same report. kitvas never reverts anything: the person restores, or not.
//
// A file that does not compile now (Claude halfway through a write) is not read: its locks are
// neither changed nor lost until it compiles again.

import { type ElementNow, idEntries, lockStates } from '../../checks/index.ts';
import {
  type DraftStore,
  hiddenNow,
  type Lock,
  latestVersion,
  loadDraft,
  locksNow,
  readView,
  versionFolder,
} from '../../drafts/index.ts';
import { type EditCompiler, elementSpan, offsetOf } from '../../edit/index.ts';
import { elementIds, readSites } from '../../render/index.ts';
import type { SourceEvent } from '../api/edit/edit-schemas.ts';

export type LockDeps = {
  drafts: DraftStore;
  /** The editor's compiler; without it the elements come from the last build's `ids.json`. */
  compiler?: EditCompiler | undefined;
};

/** Data of the `locks` event: the locked ids another writer changed, as the latest version names them. */
export type LocksEvent = { slug: string; changed: string[] };

/** One lock and what became of it; `unread`: its file does not compile now. */
export type LockEntry = {
  lock: Lock;
  state: 'same' | 'changed' | 'lost' | 'unread';
  /** The element it is on now; `null` when lost or unread. */
  element: ElementNow | null;
};

export type LockReport = { version: number; entries: LockEntry[] };

/** What `GET …/view` answers. */
export type ViewNow = { locked: string[]; hidden: string[]; changed: string[]; lost: string[] };

type Placed = { id: string; file: string; line: number; column: number };

/** Each place with its whole source in `text`; a place that is not at an element is left out. */
function withSource(text: string, places: readonly Placed[]): ElementNow[] {
  return places.flatMap((place): ElementNow[] => {
    const at = offsetOf(text, place.line, place.column);
    const span = at >= 0 && text[at] === '<' ? elementSpan(text, at) : null;
    if (span === null) return [];
    return [{ ...place, source: text.slice(span.start, span.end) }];
  });
}

/** The places of the last build of `version`, by file. */
function builtPlaces(drafts: DraftStore, slug: string, version: number): Map<string, Placed[]> {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, `${versionFolder(version)}/build/json/ids.json`);
  } catch {
    raw = undefined;
  }
  const byFile = new Map<string, Placed[]>();
  for (const { id, file, line, column } of idEntries(raw)) {
    byFile.set(file, [...(byFile.get(file) ?? []), { id, file, line, column }]);
  }
  return byFile;
}

/**
 * The elements of `files` of a version now, each with its whole source, compiled once per file.
 * `unread`: files that are missing or do not compile.
 */
export async function elementsNow(
  deps: LockDeps,
  slug: string,
  version: number,
  files: Iterable<string>,
): Promise<{ elements: ElementNow[]; unread: Set<string> }> {
  const elements: ElementNow[] = [];
  const unread = new Set<string>();
  const built = deps.compiler === undefined ? builtPlaces(deps.drafts, slug, version) : null;
  for (const file of new Set(files)) {
    const text = deps.drafts.readText(slug, `${versionFolder(version)}/${file}`);
    if (text === undefined) {
      unread.add(file);
      continue;
    }
    if (built !== null) {
      elements.push(...withSource(text, built.get(file) ?? []));
      continue;
    }
    const code = deps.compiler === undefined ? null : await deps.compiler.jsxDev(text, file);
    const sites = code === null ? undefined : readSites(code);
    if (sites === undefined) {
      unread.add(file);
      continue;
    }
    elements.push(...withSource(text, elementIds(file, sites)));
  }
  return { elements, unread };
}

/** The draft's locks against their elements now. Throws DRAFT_NOT_FOUND for no such draft. */
export async function lockReport(deps: LockDeps, slug: string): Promise<LockReport> {
  const version = latestVersion(loadDraft(deps.drafts, slug));
  const locks = locksNow(deps.drafts, slug, version);
  if (locks.length === 0) return { version, entries: [] };
  const files = locks.map((lock) => lock.file);
  const { elements, unread } = await elementsNow(deps, slug, version, files);
  const read = locks.filter((lock) => !unread.has(lock.file));
  const states = lockStates(read, elements);
  const entries = locks.map((lock): LockEntry => {
    if (unread.has(lock.file)) return { lock, state: 'unread', element: null };
    const state = states[read.indexOf(lock)];
    return state === undefined
      ? { lock, state: 'lost', element: null }
      : { lock, state: state.state, element: state.element };
  });
  return { version, entries };
}

/** The ids of the report for the view: a lock whose element moved is named by its id now. */
export function viewOf(report: LockReport, hidden: readonly string[]): ViewNow {
  const view: ViewNow = { locked: [], hidden: [...hidden], changed: [], lost: [] };
  for (const { lock, state, element } of report.entries) {
    if (state === 'lost') {
      view.lost.push(lock.id);
      continue;
    }
    const id = element?.id ?? lock.id;
    if (!view.locked.includes(id)) view.locked.push(id);
    if (state === 'changed') view.changed.push(id);
  }
  return view;
}

/** `GET …/view`: both lists as the latest version names them, and the changed and lost locks. */
export async function viewNow(deps: LockDeps, slug: string): Promise<ViewNow> {
  const report = await lockReport(deps, slug);
  return viewOf(report, hiddenNow(deps.drafts, slug, report.version));
}

export type LockWatchDeps = LockDeps & {
  publish(data: LocksEvent): void;
  onError?: ((error: unknown) => void) | undefined;
};

export type LockWatch = {
  /** A `source` event: one of another writer makes the draft's locks be compared again. */
  heard(event: SourceEvent): void;
  /** Waits for the comparisons running now. */
  close(): Promise<void>;
};

/**
 * Compares a draft's locks after each change by another writer, one draft at a time. A `locks`
 * event goes out when the draft's changed or lost locks are not what they were last time; the
 * first time, when any is.
 */
export function watchLocks(deps: LockWatchDeps): LockWatch {
  const running = new Map<string, Promise<void>>();
  const told = new Map<string, string>();
  let closed = false;

  const compare = async (slug: string): Promise<void> => {
    // Most drafts have no locks: nothing to read or compile (nor a draft that is being made).
    if (readView(deps.drafts, slug).locked.length === 0 && !told.has(slug)) return;
    const view = viewOf(await lockReport(deps, slug), []);
    const key = JSON.stringify([view.changed, view.lost]);
    if ((told.get(slug) ?? JSON.stringify([[], []])) === key) return;
    told.set(slug, key);
    deps.publish({ slug, changed: view.changed });
  };

  return {
    heard(event) {
      if (closed || event.by !== 'other') return;
      const before = running.get(event.slug) ?? Promise.resolve();
      const next = before
        .then(() => compare(event.slug))
        .catch((error: unknown) => deps.onError?.(error));
      running.set(event.slug, next);
      void next.then(() => {
        if (running.get(event.slug) === next) running.delete(event.slug);
      });
    },
    async close() {
      closed = true;
      await Promise.all([...running.values()]);
    },
  };
}
