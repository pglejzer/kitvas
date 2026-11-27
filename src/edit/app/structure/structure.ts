// The editor's map of a draft (spec 4b, decisions 6 and 7; plan 14, task B6): every element
// of the latest version as its source writes it, whether it can be moved and why not, what it
// takes inside, and one element's whole source for copy and cut. Drop slots, the actions, the
// layers tree and the matching after Claude's edits all read it. The ids are the build's
// (`elementIds`), found again in the current text, so they are the ids the frame's elements carry.

import {
  type DraftStore,
  latestVersion,
  loadDraft,
  parseLayout,
  pascalCase,
  SECTION_ID,
  versionFolder,
} from '../../../drafts/index.ts';
import type { KitComponent, KitStore, LoadedKit } from '../../../kit/index.ts';
import { elementIds, readSites } from '../../../render/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { aroundOf, innerArrayAt } from '../../domain/list/nest.ts';
import { ELEMENT_ID, fileOfId, hashOf, MAX_LIST_DEPTH } from '../../domain/ops.ts';
import { contextOf, elementSpan, isMixed, parentOf } from '../../domain/structure/subtree.ts';
import { offsetOf, openAt, plainText } from '../../domain/tsx/tsx-reader.ts';
import type { Refusal } from '../../domain/types.ts';
import type { EditCompiler } from '../../ports/compiler.ts';
import { catalogComponent, editKit } from '../edit-state.ts';
import { locateElement } from '../locate.ts';
import { inPageOrder, sourceFiles } from './section-files.ts';

export type StructureDeps = {
  drafts: DraftStore;
  kits: KitStore;
  compiler: EditCompiler;
  /** The ETag of a file's text, as the studio's API writes it. */
  etag(text: string): string;
};

/** The shape of the studio's `StructureEntrySchema` (`src/studio/api/edit/structure-schemas.ts`). */
export type StructureEntryView = {
  id: string;
  file: string;
  line: number;
  column: number;
  tag: string;
  parent: string | null;
  hash: string;
  text: string | null;
  props: string[];
  component: string | null;
  movable: Refusal | null;
  lists: string[] | null;
  item: boolean;
  accepts: boolean;
  mixed: boolean;
  interactive: boolean;
  root: 'section' | 'slot' | null;
};

/** The same shape as the studio's `StructureSchema`. */
export type StructureView = {
  version: number;
  folder: string;
  etags: Record<string, string>;
  elements: StructureEntryView[];
  sections: { id: string; element: string | null; purpose: string }[];
};

/** The same shape as the studio's `SubtreeSchema`. */
export type SubtreeView = { id: string; file: string; hash: string; source: string };

/** `StructureEntrySchema.text` keeps a text this long: enough to tell two elements apart. */
const MAX_TEXT = 80;
/** `ElementIdSchema`'s length: a deeper id could not be named in an op, so it is not listed. */
const MAX_ID = 200;

/** HTML elements that never have children. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
/** HTML elements a person clicks or types into: never dropped inside one another. */
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);
/** Kit categories of the same kind (the contract's categories: `action`, `input`). */
const INTERACTIVE_CATEGORIES: ReadonlySet<string> = new Set(['action', 'input']);

type Site = { id: string; tag: string; at: number; line: number; column: number };
type FileContext = {
  text: string;
  file: string;
  kit: LoadedKit | null;
  /** Whether the element at an offset is inside a `{…}` child, kept for the whole file. */
  memo: Map<number, boolean>;
  /** The id of the element whose `<` is at an offset: how a list's root is named. */
  ids: ReadonlyMap<number, string>;
};
type Standing = { movable: Refusal | null; root: 'section' | 'slot' | null };
type Listed = { lists: string[] | null; item: boolean };

const validId = (id: string): boolean => id.length <= MAX_ID && ELEMENT_ID.test(id);

/** `sections/Hero:section/Stack/Card.2` is in `sections/Hero:section/Stack`; a root in none. */
function parentIdOf(id: string): string | null {
  const slash = id.lastIndexOf('/');
  return slash > id.indexOf(':') ? id.slice(0, slash) : null;
}

const takesChildren = (component: KitComponent): boolean =>
  component.props.some((prop) => prop.name === 'children' && prop.type === 'node');

/**
 * An element dropped inside is accepted by a kit component with `children: node`, by a part (the
 * catalog lists no props of its own for one, and the palette offers parts as containers) and by
 * an HTML element that is not void. A capitalised tag the kit does not know accepts nothing.
 */
function acceptsChildren(tag: string, component: KitComponent | null): boolean {
  if (component !== null) return tag.includes('.') || takesChildren(component);
  return /^[a-z]/.test(tag) && !VOID.has(tag);
}

function isInteractive(tag: string, component: KitComponent | null): boolean {
  if (component !== null) return INTERACTIVE_CATEGORIES.has(component.category);
  return INTERACTIVE_TAGS.has(tag);
}

/**
 * Whether the element at `at`, or any element around it, is written inside a `{…}` child (a
 * `.map`, a condition, a ternary). Only such an element can stand in a list: the rest of the
 * file is never read for one.
 */
function inExpression(text: string, at: number, memo: Map<number, boolean>): boolean {
  const chain: number[] = [];
  let current: number | null = at;
  let found = false;
  while (current !== null) {
    const known = memo.get(current);
    if (known !== undefined) {
      found = known;
      break;
    }
    chain.push(current);
    if (contextOf(text, current) === 'expression') {
      found = true;
      break;
    }
    const parent = parentOf(text, current);
    // A parent always opens before its child; anything else would walk in a circle.
    current = parent !== null && parent < current ? parent : null;
  }
  for (const each of chain) memo.set(each, found);
  return found;
}

/** JSX written as a prop's value (`label={<Text />}`) sits inside its parent's opening tag. */
function isSlotRoot(text: string, at: number, parent: number): boolean {
  const open = openAt(text, parent);
  return open !== null && at > parent && at < open.end;
}

/**
 * Where the element stands, and so why it cannot be moved, deleted or duplicated as an element
 * (the target rules of `applyStructure`): written as an expression's own JSX, the root a function
 * returns, or the root of a slot. Only its own place counts (ADR 0065): a plain child inside a
 * list item's template moves like any other, and so does an element inside a slot.
 */
function standingOf(text: string, at: number): Standing {
  const parent = parentOf(text, at);
  const root = parent === null ? 'section' : isSlotRoot(text, at, parent) ? 'slot' : null;
  if (contextOf(text, at) === 'expression') return { movable: 'in-expression', root };
  const movable = root === 'section' ? 'section-root' : root === 'slot' ? 'slot-root' : null;
  return { movable, root };
}

/** Why the element whose `<` is at `at` cannot be moved or deleted; `null` when it can. */
export const movableAt = (text: string, at: number): Refusal | null => standingOf(text, at).movable;

/**
 * The `.map` lists around the element (ADR 0065): the ids of their callbacks' root elements,
 * outer first, the element's own id last when it is such a root. `null` when the copies of one
 * cannot be counted, or a root has no id an op could name. `item`: the element is the root of
 * its innermost list and the array of that list's first copy is a literal of the file, so the
 * page renders one copy per item and a drag of a copy reorders the data (ADR 0059).
 */
function listedAt(context: FileContext, at: number): Listed {
  const { text, memo, ids } = context;
  if (!inExpression(text, at, memo)) return { lists: [], item: false };
  const levels = aroundOf(text, at)?.levels;
  if (levels === undefined) return { lists: [], item: false };
  if (levels === null || levels.length > MAX_LIST_DEPTH) return { lists: null, item: false };
  const lists: string[] = [];
  for (const level of levels) {
    const id = ids.get(level.root);
    if (id === undefined || !validId(id)) return { lists: null, item: false };
    lists.push(id);
  }
  const inner = levels[levels.length - 1];
  if (inner === undefined || inner.root !== at) return { lists, item: false };
  const first = innerArrayAt(
    levels,
    levels.slice(1).map(() => 0),
  );
  return { lists, item: typeof first !== 'string' };
}

/** The build's ids of a file's elements and their `<`; none when the file does not compile. */
async function sitesOf(compiler: EditCompiler, text: string, file: string): Promise<Site[]> {
  const code = await compiler.jsxDev(text, file);
  if (code === null) return [];
  const sites = readSites(code);
  if (sites === undefined) return [];
  return elementIds(file, sites).flatMap((entry) => {
    const at = offsetOf(text, entry.line, entry.column);
    return at >= 0 && text[at] === '<'
      ? [{ id: entry.id, tag: entry.tag, at, line: entry.line, column: entry.column }]
      : [];
  });
}

/** One element as the structure lists it; `null` when the reader finds no element there. */
function entryOf(context: FileContext, site: Site): StructureEntryView | null {
  const { text, file, kit } = context;
  const span = elementSpan(text, site.at);
  const open = openAt(text, site.at);
  if (span === null || open === null || !validId(site.id)) return null;
  const component = catalogComponent(kit, site.tag);
  const { movable, root } = standingOf(text, site.at);
  const { lists, item } = listedAt(context, site.at);
  return {
    id: site.id,
    file,
    line: site.line,
    column: site.column,
    tag: site.tag,
    parent: parentIdOf(site.id),
    hash: hashOf(text.slice(span.start, span.end)),
    text: plainText(text, open)?.value.slice(0, MAX_TEXT) ?? null,
    // Every attribute as written, `className` and `key` too: the matching reads them all.
    props: open.attrs.map((attr) => attr.name),
    component: component?.name ?? null,
    movable,
    lists,
    item,
    accepts: acceptsChildren(site.tag, component),
    mixed: isMixed(text, site.at),
    interactive: isInteractive(site.tag, component),
    root,
  };
}

type LayoutEntry = { id: string; purpose: string };

/** The layout's sections in order; none for a draft without a layout (a craft draft). */
function layoutSections(drafts: DraftStore, slug: string, base: string): LayoutEntry[] {
  const text = drafts.readText(slug, `${base}/md/layout.md`);
  if (text === undefined) return [];
  return parseLayout(text)
    .sections.filter((section) => SECTION_ID.test(section.id))
    .map(({ id, purpose }) => ({ id, purpose }));
}

/**
 * Each section with its root element, what its function returns: the row the layers tree shows
 * for it and the place an insert with nothing selected goes into. Never an element of the
 * generated `index.tsx`, which no edit may change. `null` when the section's file is missing or
 * does not compile, or returns a fragment (its children are each a root of their own).
 */
function sectionElements(
  sections: LayoutEntry[],
  elements: readonly StructureEntryView[],
): StructureView['sections'] {
  return sections.map(({ id, purpose }) => {
    const prefix = `sections/${pascalCase(id)}:`;
    const root = elements.find((entry) => entry.root === 'section' && entry.id.startsWith(prefix));
    return { id, element: root?.id ?? null, purpose };
  });
}

/**
 * Every element of the latest version's sections and sketches, in page order, read from the files
 * as they are now. A file that does not compile (Claude may be halfway through it) lists no
 * elements, but keeps its ETag, so the editor still hears when it changes.
 */
export async function readStructure(deps: StructureDeps, slug: string): Promise<StructureView> {
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  const base = versionFolder(version);
  const kit = editKit(deps.kits, draft.kit.id);
  const sections = layoutSections(deps.drafts, slug, base);

  const texts = new Map<string, string>();
  const etags: Record<string, string> = {};
  for (const file of sourceFiles(deps.drafts, slug, version)) {
    const text = deps.drafts.readText(slug, `${base}/${file}`);
    if (text === undefined) continue;
    texts.set(file, text);
    etags[file] = deps.etag(text);
  }

  const elements: StructureEntryView[] = [];
  for (const file of inPageOrder(
    [...texts.keys()],
    sections.map((section) => section.id),
  )) {
    const text = texts.get(file) ?? '';
    const sites = await sitesOf(deps.compiler, text, file);
    const context: FileContext = {
      text,
      file,
      kit,
      memo: new Map<number, boolean>(),
      ids: new Map(sites.map((site) => [site.at, site.id])),
    };
    for (const site of sites) {
      const entry = entryOf(context, site);
      if (entry !== null) elements.push(entry);
    }
  }
  return {
    version,
    // Forward slashes on every system, so the path pastes into an editor or a terminal.
    folder: `${deps.drafts.dir(slug).replaceAll('\\', '/')}/${base}`,
    etags,
    elements,
    sections: sectionElements(sections, elements),
  };
}

/**
 * The element `id`'s whole source in the latest version, from its `<` to the end of its closing
 * tag, and its hash. Throws EDIT_ELEMENT_NOT_FOUND when it is not there.
 */
export async function readSubtree(
  deps: Pick<StructureDeps, 'drafts' | 'compiler'>,
  slug: string,
  id: string,
): Promise<SubtreeView> {
  const version = latestVersion(loadDraft(deps.drafts, slug));
  const file = fileOfId(id);
  const missing = () => new KitvasError('EDIT_ELEMENT_NOT_FOUND', { slug, version, id });
  const text = deps.drafts.readText(slug, `${versionFolder(version)}/${file}`);
  if (text === undefined) throw missing();
  // Found again in the current text: Claude may have changed the file since the structure read.
  const at = await locateElement(deps.compiler, text, file, id);
  if (typeof at !== 'number') throw missing();
  const span = elementSpan(text, at);
  if (span === null) throw missing();
  const source = text.slice(span.start, span.end);
  return { id, file, hash: hashOf(source), source };
}
