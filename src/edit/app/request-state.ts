// The texts of one edit request in memory (spec 4b, decision 3; plan 14, task B3), with the place
// of every element its ops may name. Ids name elements as they were before the request, so every
// change carries those places along its `moved` map, and a later op finds its elements where the
// earlier ones left them. The draft's kit is here too: its catalog says what takes children and
// what is interactive, and its names are what the kit import lists (decision 8).

import { type DraftStore, loadDraft, readOptions, versionFolder } from '../../drafts/index.ts';
import {
  DEFAULT_BREAKPOINTS,
  type KitComponent,
  type KitStore,
  kitBreakpoints,
  type LoadedKit,
} from '../../kit/index.ts';
import { elementIds, readSites } from '../../render/index.ts';
import type { DraftOption } from '../../shared/index.ts';
import { fileOfId } from '../domain/ops.ts';
import type { SiteId } from '../domain/structure/renames.ts';
import { parentOf } from '../domain/structure/subtree.ts';
import { offsetOf, openingTags, readTag } from '../domain/tsx/apply-tsx.ts';
import { syncKitImports } from '../domain/tsx/kit-imports.ts';
import type { ApplyOptions, OffsetMap, Refusal, Span } from '../domain/types.ts';
import type { EditCompiler } from '../ports/compiler.ts';
import { editKit } from './edit-state.ts';

/** What a request reads besides its texts: `ApplyEditsDeps` has all of it. */
export type WorkDeps = {
  drafts: DraftStore;
  compiler: EditCompiler;
  kits: KitStore;
  etag(text: string): string;
  sectionScss(slug: string, version: number, tsxFile: string): string | null;
};

/**
 * One file of a request: its text as read (`null`: it was not there), its text after the ops
 * (`null`: removed), and the ops that changed it.
 */
export type FileState = { read: string | null; text: string | null; ops: number[] };

/** An element of a compiled text: id, tag, 1-based line and column, and the offset of its `<`. */
export type Site = SiteId & { at: number };

/**
 * Where an element named by its id before the request is now, and its tag there. `own`: still in
 * its file under its tag, which `renameMap` follows; else it went to another file, or a
 * `replaceTag` gave it another tag, and the answer's renames add it themselves.
 */
type Spot = { file: string; at: number; tag: string; own: boolean };

/** A TSX file's elements as read, and where each offset of the read text is now. */
type Start = { sites: Site[]; moved: OffsetMap };

type Kit = { loaded: LoadedKit | null; names: ReadonlySet<string> };

/**
 * How the request's ops are applied. `breakpoints`: the kit's widths, read when an op names one
 * (spec 4c): a style at another width is refused.
 */
export type WorkOptions = ApplyOptions & { breakpoints?: (() => readonly number[]) | undefined };

export type Work = {
  deps: WorkDeps;
  slug: string;
  /** The latest version: the one every text was read from. */
  version: number;
  kitId: string;
  options: WorkOptions;
  /** ETags of the files the ops were made from, as the editor sent them. */
  etags: Record<string, string>;
  files: Map<string, FileState>;
  /** The TSX files read so far; `invalid`: the text as read does not compile. */
  starts: Map<string, Start | 'invalid'>;
  /** Every element of those files by its id before the request; `null`: an op removed it. */
  track: Map<string, Spot | null>;
  /** The `<` of each element the request created, where it is now. */
  created: { file: string; at: number }[];
  /** Props a `replaceTag` dropped. */
  dropped: string[];
  kit?: Kit;
};

/** Why an op wrote nothing: a refusal, or a change by someone else in a file (4a conflicts). */
export type Stop = { refused: Refusal } | { conflict: 'changed' | 'gone'; file: string };
export type OpResult = 'done' | Stop;
/** An element found by its id before the request: its file, its `<`, the file's current text. */
export type Found = { file: string; at: number; text: string };

export const same: OffsetMap = (old) => old;
export const compose =
  (first: OffsetMap, next: OffsetMap): OffsetMap =>
  (old) => {
    const mid = first(old);
    return mid === null ? null : next(mid);
  };
export const whole = (text: string): Span => ({ start: 0, end: text.length });

export function createWork(
  deps: WorkDeps,
  at: Pick<Work, 'slug' | 'version' | 'kitId' | 'options' | 'etags'>,
): Work {
  const work: Work = {
    deps,
    ...at,
    files: new Map<string, FileState>(),
    starts: new Map<string, Start | 'invalid'>(),
    track: new Map<string, Spot | null>(),
    created: [],
    dropped: [],
  };
  // The kit is loaded only when an op asks for its widths.
  work.options = { ...at.options, breakpoints: () => breakpointsOf(work) };
  return work;
}

/** The widths a style may be written from: the kit's, or the presets when it cannot be read. */
export function breakpointsOf(work: Work): readonly number[] {
  const { loaded } = kitOf(work);
  return loaded === null ? DEFAULT_BREAKPOINTS : kitBreakpoints(loaded.kit);
}

/** The version's options in their file's order (ADR 0082); none without a readable file. */
export const optionsOf = (work: Work): DraftOption[] =>
  readOptions(work.deps.drafts, work.slug, versionFolder(work.version));

/** A file of the request, read once from the version; a missing one has `read: null`. */
export function stateOf(work: Work, file: string): FileState {
  const known = work.files.get(file);
  if (known) return known;
  const path = `${versionFolder(work.version)}/${file}`;
  const read = work.deps.drafts.readText(work.slug, path) ?? null;
  const state: FileState = { read, text: read, ops: [] };
  work.files.set(file, state);
  return state;
}

/** Someone else wrote the file since the editor last heard of it. */
export const changedSince = (work: Work, file: string, state: FileState): boolean =>
  work.etags[file] !== (state.read === null ? undefined : work.deps.etag(state.read));

/** The elements of a TSX text, from its `jsxDev` code, with the offset of each `<`. */
export function sitesOf(file: string, text: string, code: string): Site[] {
  const sites = readSites(code);
  if (sites === undefined) return [];
  return elementIds(file, sites).flatMap((entry): Site[] => {
    const at = offsetOf(text, entry.line, entry.column);
    if (at < 0 || text[at] !== '<') return [];
    return [{ id: entry.id, line: entry.line, column: entry.column, tag: entry.tag, at }];
  });
}

/**
 * The file's elements as read, compiled once. Every op that changes a TSX file calls this first,
 * so the places kept for it start from the read text.
 */
export async function startOf(work: Work, file: string): Promise<Start | 'invalid'> {
  const known = work.starts.get(file);
  if (known !== undefined) return known;
  const { read } = stateOf(work, file);
  let start: Start | 'invalid' = { sites: [], moved: same };
  if (read !== null) {
    const code = await work.deps.compiler.jsxDev(read, file);
    start = code === null ? 'invalid' : { sites: sitesOf(file, read, code), moved: same };
  }
  work.starts.set(file, start);
  if (start === 'invalid') return start;
  for (const site of start.sites) {
    work.track.set(site.id, { file, at: site.at, tag: site.tag, own: true });
  }
  return start;
}

/**
 * The element `id` (an id before the request) where the request's earlier ops left it. Missing
 * from a file someone else changed: they took it away, a conflict `gone` (spec 4a).
 */
export async function locate(work: Work, id: string): Promise<Found | Stop> {
  const file = fileOfId(id);
  const start = await startOf(work, file);
  const state = stateOf(work, file);
  const spot = work.track.get(id);
  if (spot === undefined) {
    if (state.read === null) return { refused: 'not-found' };
    if (start === 'invalid') return { refused: 'invalid' };
    return changedSince(work, file, state) ? { conflict: 'gone', file } : { refused: 'not-found' };
  }
  const text = spot === null ? null : stateOf(work, spot.file).text;
  if (spot === null || text === null || text[spot.at] !== '<') return { refused: 'not-found' };
  return { file: spot.file, at: spot.at, text };
}

/** `file` becomes `next`; every place kept in it goes along `moved` (`null` text: removed). */
export function commit(
  work: Work,
  file: string,
  index: number,
  next: string | null,
  moved: OffsetMap,
): void {
  const state = stateOf(work, file);
  state.text = next;
  if (!state.ops.includes(index)) state.ops.push(index);
  const map: OffsetMap = next === null ? () => null : moved;
  const start = work.starts.get(file);
  if (start !== undefined && start !== 'invalid') start.moved = compose(start.moved, map);
  for (const [id, spot] of work.track) {
    if (spot === null || spot.file !== file) continue;
    const at = map(spot.at);
    work.track.set(id, at === null ? null : { ...spot, at });
  }
  work.created = work.created.flatMap((made) => {
    if (made.file !== file) return [made];
    const at = map(made.at);
    return at === null ? [] : [{ file, at }];
  });
}

// The kit's rules, the same as the structure route shows the editor (`structure.ts`).

/** HTML elements that never have children. */
const VOID = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(' '),
);
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);
const INTERACTIVE_CATEGORIES: ReadonlySet<string> = new Set(['action', 'input']);

/** The component names of a kit (the project's additions and the icon component included). */
function namesOf(loaded: LoadedKit | null): ReadonlySet<string> {
  const names = new Set(loaded?.kit.components.map((component) => component.name) ?? []);
  const icons = loaded?.kit.icons;
  if (icons?.source === 'component') names.add(icons.component);
  return names;
}

/** The draft's kit, loaded once per request; `loaded: null` when it cannot be read. */
export function kitOf(work: Work): Kit {
  if (work.kit === undefined) {
    const loaded = editKit(work.deps.kits, work.kitId);
    work.kit = { loaded, names: namesOf(loaded) };
  }
  return work.kit;
}

/** Any draft's kit names, for the section ops (another draft's section must use the same kit). */
export function kitNamesOf(work: Work, slug: string): ReadonlySet<string> {
  if (slug === work.slug) return kitOf(work).names;
  return namesOf(editKit(work.deps.kits, loadDraft(work.deps.drafts, slug).kit.id));
}

/** `Card.Header` is the part `Header` of `Card`: the catalog entry is `Card`. */
export function componentOf(kit: LoadedKit | null, tag: string): KitComponent | null {
  const name = tag.split('.')[0] ?? tag;
  if (!/^[A-Z]/.test(name)) return null;
  return kit?.kit.components.find((component) => component.name === name) ?? null;
}

/** A kit component with `children: node`, a part, or an HTML element that is not void. */
export function accepts(kit: LoadedKit | null, tag: string): boolean {
  const component = componentOf(kit, tag);
  if (component === null) return /^[a-z]/.test(tag) && !VOID.has(tag);
  if (tag.includes('.')) return true;
  return component.props.some((prop) => prop.name === 'children' && prop.type === 'node');
}

export function interactive(kit: LoadedKit | null, tag: string): boolean {
  const component = componentOf(kit, tag);
  return component === null
    ? INTERACTIVE_TAGS.has(tag)
    : INTERACTIVE_CATEGORIES.has(component.category);
}

/** Some element whose `<` lies in `range` of `text` is interactive. */
export function interactiveIn(kit: LoadedKit | null, text: string, range: Span): boolean {
  return openingTags(text).some((at) => {
    if (at < range.start || at >= range.end) return false;
    const view = readTag(text, at);
    return typeof view !== 'string' && interactive(kit, view.name);
  });
}

/** The element at `at`, or one around it, is interactive. A fragment's `<` is passed over. */
export function inInteractive(kit: LoadedKit | null, text: string, at: number | null): boolean {
  let current = at;
  for (let depth = 0; current !== null && depth < 1_000; depth += 1) {
    const view = readTag(text, current);
    if (typeof view !== 'string' && interactive(kit, view.name)) return true;
    current = parentOf(text, current);
  }
  return false;
}

/** After an element op the file's kit import names exactly the kit components it uses. */
export function syncImports(work: Work, file: string, index: number): void {
  const { loaded, names } = kitOf(work);
  const text = stateOf(work, file).text;
  // Without the kit's catalog no name is known to be unused: the import is left alone.
  if (loaded === null || text === null) return;
  const synced = syncKitImports(text, names);
  if (synced.text !== text) commit(work, file, index, synced.text, synced.moved);
}
