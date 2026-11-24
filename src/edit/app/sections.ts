// The editor's section ops (spec 4b, sections and decision 10; plan 14, task B5): reorder the
// layout, insert a section of another draft that uses the same kit, remove a section. Each changes
// `md/layout.md` and the section's TSX and SCSS files. Nothing is written here: the new texts go
// back to the request (task B3), which checks them and writes them with its other files, all or
// none, and makes the inverse from them.

import {
  type Draft,
  type DraftStore,
  insertSectionBlock,
  latestVersion,
  loadDraft,
  moveSectionBlock,
  parseLayout,
  pascalCase,
  removeSectionBlock,
  renameSectionBlock,
  SECTION_ID,
  SHARED_ID,
  sectionBlock,
  versionFolder,
} from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import type { EditOp } from '../domain/ops.ts';
import type { Refusal } from '../domain/types.ts';

export type SectionOp = Extract<EditOp, { op: 'moveSection' | 'insertSection' | 'removeSection' }>;
type InsertOp = Extract<SectionOp, { op: 'insertSection' }>;

export type SectionDeps = {
  drafts: DraftStore;
  /** The component names of a draft's kit, the project's additions included. */
  kitNames(slug: string): ReadonlySet<string>;
};

/**
 * The text of a file inside the version as the request has it so far: what earlier ops of the
 * request made of it, else the file as written; `undefined` when there is none, or when an earlier
 * op of the request removed it.
 */
export type CurrentText = (file: string) => string | undefined;

/** A new text by path inside the version; `text: null` removes the file. */
export type SectionChange = { file: string; text: string | null };

/** `files: []`: the op changes nothing (a section moved to where it is). */
export type SectionResult = { files: SectionChange[] } | { refused: Refusal };

const LAYOUT = 'md/layout.md';
/** An op names a section in at most 48 characters (`ops.ts`); a longer id could not be edited. */
const MAX_SECTION = 48;
/** How far `freeId` counts: `plans-2` up to `plans-99`. */
const MAX_COPIES = 99;
/** `import [type] [clause from] 'source'` at the start of a line, as the ds check reads imports. */
const IMPORT = /^[ \t]*import\s+(type\s+)?(?:([\w$*{}\s,]+?)\s+from\s+)?['"]([^'"]+)['"]/gm;

const tsxPath = (id: string): string => `src/tsx/sections/${pascalCase(id)}.tsx`;
/** A section's SCSS file: `<id>.scss`, or the partial `_<id>.scss` (`section-files.ts`). */
const scssPath = (id: string, partial: boolean): string =>
  `src/scss/sections/${partial ? '_' : ''}${id}.scss`;

const sectionIds = (layout: string): string[] =>
  parseLayout(layout).sections.map((section) => section.id);

/** The draft the section goes into, and its texts so far. */
type Target = { slug: string; draft: Draft; layout: string; texts: CurrentText };

/** The section to copy, read from its draft. */
type Source = {
  block: string;
  tsx: string;
  scss: { text: string; partial: boolean } | null;
};

/**
 * Applies a section op to the latest version's texts. A version that is not the latest throws
 * `EDIT_STALE_VERSION`, as `applyEdits` does; anything the op cannot do is a refusal.
 */
export function applySectionOp(
  deps: SectionDeps,
  slug: string,
  version: number,
  op: SectionOp,
  texts: CurrentText,
): SectionResult {
  const draft = loadDraft(deps.drafts, slug);
  const latest = latestVersion(draft);
  if (version !== latest) throw new KitvasError('EDIT_STALE_VERSION', { slug, version, latest });
  // A craft draft's sketches are not sections: it has no layout to change.
  if (draft.kind === 'craft') return { refused: 'invalid' };
  const layout = texts(LAYOUT);
  if (layout === undefined) return { refused: 'not-found' };
  if (op.op === 'moveSection') return moveSection(layout, op.section, op.after);
  if (op.op === 'removeSection') return removeSection(layout, op.section, texts);
  return insertSection(deps, { slug, draft, layout, texts }, op);
}

function moveSection(layout: string, id: string, after: string | null): SectionResult {
  const text = moveSectionBlock(layout, id, after);
  if (text === null) return { refused: 'not-found' };
  return { files: text === layout ? [] : [{ file: LAYOUT, text }] };
}

/** The block leaves the layout, and the section's TSX and SCSS files are removed. */
function removeSection(layout: string, id: string, texts: CurrentText): SectionResult {
  const ids = sectionIds(layout);
  if (!ids.includes(id)) return { refused: 'not-found' };
  // A layout without sections does not build: the draft would have nothing left to show.
  if (ids.length === 1) return { refused: 'invalid' };
  const text = removeSectionBlock(layout, id);
  if (text === null) return { refused: 'not-found' };
  // A section still in the layout under the same file name (`plans-2` and `plans2` are both
  // `Plans2.tsx`, or the same id written twice) keeps its file.
  const rest = sectionIds(text);
  const gone = [
    ...(rest.some((other) => pascalCase(other) === pascalCase(id)) ? [] : [tsxPath(id)]),
    ...(rest.includes(id) ? [] : [scssPath(id, false), scssPath(id, true)]),
  ];
  const files: SectionChange[] = [{ file: LAYOUT, text }];
  for (const file of gone) {
    if (texts(file) !== undefined) files.push({ file, text: null });
  }
  return { files };
}

/**
 * A copy of another draft's section under a free id: its block (renamed) goes into the layout,
 * its TSX file is copied with the component renamed after the id, and its SCSS file is copied.
 */
function insertSection(deps: SectionDeps, target: Target, op: InsertOp): SectionResult {
  const { layout, texts } = target;
  if (op.after !== null && !sectionIds(layout).includes(op.after)) return { refused: 'not-found' };
  const source = readSource(deps, target, op.from);
  if ('refused' in source) return source;
  const refusal = importRefusal(source.tsx, deps.kitNames(target.slug));
  if (refusal !== null) return { refused: refusal };
  const id = freeId(op.from.section, layout, texts);
  if (id === null) return { refused: 'invalid' };
  const tsx = renameComponent(source.tsx, pascalCase(op.from.section), pascalCase(id));
  const text = insertSectionBlock(layout, renameSectionBlock(source.block, id), op.after);
  if (tsx === null || text === null) return { refused: 'invalid' };
  const files: SectionChange[] = [
    { file: LAYOUT, text },
    { file: tsxPath(id), text: tsx },
  ];
  if (source.scss !== null) {
    files.push({ file: scssPath(id, source.scss.partial), text: source.scss.text });
  }
  return { files };
}

/**
 * How the section's draft is read: another draft at its latest version, when it uses the same
 * kit; the draft itself through the request's texts, so earlier ops of the request count.
 */
function sourceReader(
  deps: SectionDeps,
  target: Target,
  slug: string,
): { read: CurrentText } | { refused: Refusal } {
  if (slug === target.slug) return { read: target.texts };
  let other: Draft;
  try {
    other = loadDraft(deps.drafts, slug);
  } catch (error) {
    // A draft that is gone or cannot be read has no section to give.
    if (error instanceof KitvasError) return { refused: 'not-found' };
    throw error;
  }
  if (other.kit.id !== target.draft.kit.id) return { refused: 'kit-mismatch' };
  const base = versionFolder(latestVersion(other));
  return { read: (file) => deps.drafts.readText(slug, `${base}/${file}`) };
}

function readSource(
  deps: SectionDeps,
  target: Target,
  from: InsertOp['from'],
): Source | { refused: Refusal } {
  const reader = sourceReader(deps, target, from.slug);
  if ('refused' in reader) return reader;
  const { read } = reader;
  // A craft draft has no layout, so it has no section either.
  const layout = read(LAYOUT);
  const block = layout === undefined ? null : sectionBlock(layout, from.section);
  const tsx = read(tsxPath(from.section));
  if (block === null || tsx === undefined) return { refused: 'not-found' };
  return { block, tsx, scss: readScss(read, from.section) };
}

/** The section's SCSS file, the plain name first; `null` when it has none. */
function readScss(read: CurrentText, id: string): Source['scss'] {
  for (const partial of [false, true]) {
    const text = read(scssPath(id, partial));
    if (text !== undefined) return { text, partial };
  }
  return null;
}

/** The kit component names an `@kit` import clause brings in, and those read off a namespace. */
function kitImportNames(text: string, clause: string): string[] {
  const names: string[] = [];
  for (const part of (/\{([^}]*)\}/.exec(clause)?.[1] ?? '').split(',')) {
    const spec = part.trim();
    if (spec === '' || spec.startsWith('type ')) continue;
    names.push(spec.split(/\s+as\s+/)[0] ?? '');
  }
  // `import * as Kit from '@kit'`: the members the file reads, as in `<Kit.Card>`.
  const namespace = /\*\s*as\s+([\w$]+)/.exec(clause)?.[1];
  if (namespace !== undefined) {
    const escaped = namespace.replace(/\$/g, '\\$');
    const member = new RegExp(`(?<![\\w$.])${escaped}\\.([A-Za-z_$][\\w$]*)`, 'g');
    for (const use of text.matchAll(member)) names.push(use[1] ?? '');
  }
  return names;
}

/**
 * A copied section may import only the kit and React. Any other file of its draft would not come
 * along (`scope`), and a component the kit of this draft does not have, such as an addition the
 * other draft saw, would not build here (`kit-mismatch`).
 */
function importRefusal(tsx: string, kitNames: ReadonlySet<string>): Refusal | null {
  for (const match of tsx.matchAll(IMPORT)) {
    const source = match[3] ?? '';
    if (source === 'react') continue;
    if (source !== '@kit') return 'scope';
    // `import type` names no component.
    if (match[1] !== undefined) continue;
    if (kitImportNames(tsx, match[2] ?? '').some((name) => !kitNames.has(name))) {
      return 'kit-mismatch';
    }
  }
  return null;
}

/**
 * `id`, else `id-2`, `id-3`, …: the first id that no section of the layout has, by itself or by
 * its file name (`plans2` and `plans-2` are both `Plans2.tsx`), and whose files do not exist.
 */
function freeId(id: string, layout: string, texts: CurrentText): string | null {
  const ids = sectionIds(layout);
  const names = new Set(ids.map(pascalCase));
  for (let copy = 1; copy <= MAX_COPIES; copy += 1) {
    const candidate = copy === 1 ? id : `${id}-${copy}`;
    if (candidate.length > MAX_SECTION || !SECTION_ID.test(candidate)) return null;
    const taken =
      candidate === SHARED_ID ||
      ids.includes(candidate) ||
      names.has(pascalCase(candidate)) ||
      texts(tsxPath(candidate)) !== undefined ||
      texts(scssPath(candidate, false)) !== undefined ||
      texts(scssPath(candidate, true)) !== undefined;
    if (!taken) return candidate;
  }
  return null;
}

/**
 * The section file with its component renamed from `from` to `to`: its declaration and an
 * `export { … }` or `export default` that names it. Texts, props and other names stay as written.
 * `null` when the file declares no such component, since the copy could not be rendered.
 */
function renameComponent(text: string, from: string, to: string): string | null {
  if (from === to) return text;
  const declaration = new RegExp(
    `\\b(function(?:\\s*\\*\\s*|\\s+)|class\\s+|const\\s+|let\\s+|var\\s+)${from}\\b`,
    'g',
  );
  const declared = text.replace(declaration, `$1${to}`);
  if (declared === text) return null;
  const word = new RegExp(`\\b${from}\\b`);
  return declared
    .replace(new RegExp(`(\\bexport\\s+default\\s+)${from}\\b`, 'g'), `$1${to}`)
    .replace(/\bexport\s*\{[^}]*\}/g, (clause) =>
      clause.replace(/[^{},]+/g, (part) =>
        part.split(/\s+as\s+/)[0]?.trim() === from ? part.replace(word, to) : part,
      ),
    );
}
