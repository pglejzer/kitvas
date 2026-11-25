// The decisions of the insert palette (spec 4b, R6; plan 14, task D5): what the search leaves, the
// JSX of a thing and where a click or a drop puts it. Pure functions over plain data, tested without
// a DOM; `palette.ts` draws and wires events.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Palette, Structure } from '../../../../src/studio/api/edit/structure-schemas.ts';
import type { Place } from '../../../channel/structure-protocol.ts';

/** Where a click puts the new thing, relative to the selected element. */
export type Where = 'before' | 'after' | 'inside';
export const WHERES: readonly Where[] = ['before', 'after', 'inside'];

export type PaletteComponent = Palette['components'][number];
export type PaletteSection = Palette['sections'][number];

/** One thing the palette offers. */
export type Item =
  | { kind: 'component'; component: PaletteComponent }
  | { kind: 'icon'; component: string; name: string }
  | { kind: 'section'; slug: string; section: string; purpose: string };

export type Filtered = {
  components: PaletteComponent[];
  icons: string[];
  sections: PaletteSection[];
};

export type Target = { anchor: string; place: Place };
export type Refusal = 'noTarget' | 'partOnly';

/** Movement up to this many pixels is a click, not a drag. */
export const DRAG_THRESHOLD = 4;

const ICON_NAME = /^[A-Za-z0-9_-]+$/;
const has = (value: string, query: string): boolean => value.toLowerCase().includes(query);

/** The label a drag carries and a drop is matched by. */
export function labelOf(item: Item): string {
  if (item.kind === 'component') return item.component.name;
  if (item.kind === 'icon') return `${item.component} ${item.name}`;
  return item.section;
}

/** What the search field leaves: a part stays with its root, and shows when the root matches. */
export function filterPalette(palette: Palette, query: string): Filtered {
  const words = query.trim().toLowerCase();
  const names = palette.icons?.names ?? [];
  if (words === '') {
    return { components: palette.components, icons: names, sections: palette.sections };
  }
  const direct = (component: PaletteComponent): boolean =>
    has(component.name, words) || has(component.category, words);
  const rootMatches = new Set(
    palette.components.filter((c) => c.parent === null && direct(c)).map((c) => c.name),
  );
  return {
    components: palette.components.filter(
      (component) =>
        direct(component) || (component.parent !== null && rootMatches.has(component.parent)),
    ),
    icons: names.filter((name) => has(name, words)),
    sections: palette.sections.filter(
      (section) => has(section.section, words) || has(section.purpose, words),
    ),
  };
}

/** The JSX a component is inserted as: its first example, else bare; `null` when it needs props. */
export function codeOf(component: PaletteComponent): string | null {
  const [example] = component.examples;
  if (example) return example.code;
  if (component.required.length > 0) return null;
  return component.accepts ? `<${component.name}></${component.name}>` : `<${component.name} />`;
}

/** The JSX of an icon, or `null` for a name that could not sit inside a string literal. */
export const iconCode = (component: string, name: string): string | null =>
  ICON_NAME.test(name) ? `<${component} name="${name}" />` : null;

type Entry = Structure['elements'][number];

const byId = (structure: Structure): Map<string, Entry> =>
  new Map(structure.elements.map((entry) => [entry.id, entry]));

/**
 * Where a click inserts: after the selected element, or inside it when it is a root (an element
 * after a root would be a second root); with nothing selected, last in the first section's root.
 * A part goes last inside the nearest selected ancestor that is its root component, nowhere else.
 * `where` is the person's choice in the pane: "after" is the rule above, "before" puts it in front
 * of the selected element (a root has no sibling), "inside" puts it last inside one that takes children.
 */
export function clickTarget(
  structure: Structure,
  selection: readonly string[],
  parent: string | null,
  where: Where = 'after',
): Target | Refusal {
  const entries = byId(structure);
  const first = selection[0];
  const selected = first === undefined ? undefined : entries.get(first);
  if (parent !== null) {
    let at = selected;
    while (at) {
      if (at.component === parent) return { anchor: at.id, place: 'last' };
      at = at.parent === null ? undefined : entries.get(at.parent);
    }
    return 'partOnly';
  }
  if (selected) {
    if (where === 'inside') {
      return selected.accepts ? { anchor: selected.id, place: 'last' } : 'noTarget';
    }
    if (selected.root !== null) {
      if (where === 'before') return 'noTarget';
      return selected.accepts ? { anchor: selected.id, place: 'last' } : 'noTarget';
    }
    if (selected.movable === 'in-expression') return 'noTarget';
    return { anchor: selected.id, place: where === 'before' ? 'before' : 'after' };
  }
  const root = structure.elements.find((entry) => entry.root === 'section' && entry.accepts);
  return root ? { anchor: root.id, place: 'last' } : 'noTarget';
}

/** Whether a drop at `anchor`/`place` is a place a part may go: inside its root only. */
export function partFits(
  structure: Structure,
  parent: string,
  anchor: string,
  place: Place,
): boolean {
  const entries = byId(structure);
  const at = entries.get(anchor);
  if (!at) return false;
  if (place === 'first' || place === 'last') return at.component === parent;
  const above = at.parent === null ? undefined : entries.get(at.parent);
  return above?.component === parent;
}

/** The section an element belongs to: the one `index.tsx` renders at it, or the one of its file. */
function sectionOf(structure: Structure, id: string): string | null {
  const direct = structure.sections.find((section) => section.element === id);
  if (direct) return direct.id;
  const entry = structure.elements.find((candidate) => candidate.id === id);
  if (!entry) return null;
  // `OrderSummary.tsx` renders the section `order-summary`.
  const stem = (entry.file.split('/').pop() ?? '').replace(/\.tsx$/, '').toLowerCase();
  return structure.sections.find((section) => section.id.replace(/-/g, '') === stem)?.id ?? null;
}

/**
 * The section a new one goes after: the one the slot or the selection is in, else the last;
 * `null` puts it first (a slot before the first section).
 */
export function sectionAfter(
  structure: Structure,
  selection: readonly string[],
  slot: Target | null = null,
): string | null {
  const ids = structure.sections.map((section) => section.id);
  const anchor = slot?.anchor ?? selection[0];
  const found = anchor === undefined ? null : sectionOf(structure, anchor);
  if (found === null) return ids[ids.length - 1] ?? null;
  if (slot?.place === 'before') return ids[ids.indexOf(found) - 1] ?? null;
  return found;
}

/** The op that inserts `item` at `slot` (a click passes none), or the reason it cannot go there. */
export function opFor(
  item: Item,
  structure: Structure,
  slot: Target | null,
  selection: readonly string[],
  where: Where = 'after',
): EditOp | Refusal | 'needsProps' {
  if (item.kind === 'section') {
    const first = selection[0];
    const before: Target | null =
      slot === null && where === 'before' && first !== undefined
        ? { anchor: first, place: 'before' }
        : slot;
    const after = sectionAfter(structure, selection, before);
    return { op: 'insertSection', from: { slug: item.slug, section: item.section }, after };
  }
  const code = item.kind === 'icon' ? iconCode(item.component, item.name) : codeOf(item.component);
  if (code === null) return 'needsProps';
  const parent = item.kind === 'component' ? item.component.parent : null;
  const target = slot ?? clickTarget(structure, selection, parent, where);
  if (typeof target === 'string') return target;
  return { op: 'insertElement', anchor: target.anchor, place: target.place, source: code };
}

/** The op for a frame `drop` of `item` at a slot; `null` when a part is dropped outside its root. */
export function dropOp(
  item: Item,
  structure: Structure,
  slot: Target,
  selection: readonly string[],
): EditOp | null {
  if (item.kind === 'component' && item.component.parent !== null) {
    if (!partFits(structure, item.component.parent, slot.anchor, slot.place)) return null;
  }
  const op = opFor(item, structure, slot, selection);
  return typeof op === 'string' ? null : op;
}

export const partName = (item: Item): string =>
  item.kind === 'component' ? (item.component.parent ?? '') : '';
