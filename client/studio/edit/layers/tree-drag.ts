// Where a dragged row of the layers tree may land (spec 4b, "Drag to move" and "Sections"). Pure
// over plain data; `layers.ts` does the pointer and the DOM. The rules match the frame's slots
// (`client/frame/drag/slots.ts`), read from `state.structure` instead of the real layout.

import type { StructureEntry } from '../../../../src/studio/api/edit/structure-schemas.ts';

export type Zone = 'before' | 'inside' | 'after';
export type Drop = { anchor: string; place: 'before' | 'after' | 'last' };

/** What the rules need of one element: the fields of a structure entry. */
export type Row = Pick<
  StructureEntry,
  'id' | 'parent' | 'movable' | 'accepts' | 'mixed' | 'interactive' | 'root'
>;

/**
 * The zone of a pointer over a row, by the row's thirds from the top; `fraction` is 0 at the top
 * edge and 1 at the bottom. A row that takes no children has halves only.
 */
export function zoneOf(fraction: number, accepts: boolean): Zone {
  const at = Math.min(1, Math.max(0, fraction));
  if (!accepts) return at < 0.5 ? 'before' : 'after';
  if (at < 1 / 3) return 'before';
  return at < 2 / 3 ? 'inside' : 'after';
}

/** True when `id` is `ancestor` or sits anywhere inside it. */
export function isWithin(rows: ReadonlyMap<string, Row>, id: string, ancestor: string): boolean {
  let at: string | null = id;
  for (let steps = 0; at !== null && steps <= rows.size; steps += 1) {
    if (at === ancestor) return true;
    at = rows.get(at)?.parent ?? null;
  }
  return false;
}

/**
 * The drop a pointer over `target` in `zone` makes for the dragged ids, or `null` when the rules
 * say no: a source that cannot move, a target inside a dragged element, no `inside` for a row that
 * takes no children or mixes text and elements, no sibling place for a root (its parent is the
 * function or the prop it sits in), none beside an element inside an expression, none between
 * the children of a mixed parent, and no interactive element inside another one.
 */
export function treeDrop(
  rows: ReadonlyMap<string, Row>,
  dragged: readonly string[],
  target: string,
  zone: Zone,
): Drop | null {
  const to = rows.get(target);
  if (!to || dragged.length === 0) return null;
  const sources: Row[] = [];
  for (const id of dragged) {
    const from = rows.get(id);
    if (!from || from.movable !== null || from.root !== null) return null;
    if (isWithin(rows, target, id)) return null;
    sources.push(from);
  }
  if (zone === 'inside') {
    if (!to.accepts || to.mixed || to.movable === 'in-expression') return null;
    if (to.interactive && sources.some((from) => from.interactive)) return null;
    return { anchor: target, place: 'last' };
  }
  if (to.root !== null || to.parent === null) return null;
  if (to.movable === 'in-expression') return null;
  const parent = rows.get(to.parent);
  if (!parent || parent.mixed) return null;
  if (parent.interactive && sources.some((from) => from.interactive)) return null;
  return { anchor: target, place: zone };
}

/** The same drop as a no-op check: dropping an element right where it already is changes nothing. */
export function isNoop(order: readonly string[], dragged: readonly string[], drop: Drop): boolean {
  if (dragged.length !== 1 || drop.place === 'last') return false;
  const [id] = dragged;
  if (id === undefined) return false;
  const at = order.indexOf(drop.anchor);
  const from = order.indexOf(id);
  if (at < 0 || from < 0) return false;
  return drop.place === 'before' ? from === at - 1 : from === at + 1;
}

export type SectionMove = { section: string; after: string | null };

/**
 * The `moveSection` a drop of section `dragged` on section `target` makes: before the target is
 * after the section that precedes it (`null` at the top). Sections reorder only among sections, so
 * `inside` is read as the nearer half. `null` when the section would stay where it is.
 */
export function sectionDrop(
  order: readonly string[],
  dragged: string,
  target: string,
  zone: Zone,
  fraction: number,
): SectionMove | null {
  if (dragged === target) return null;
  const from = order.indexOf(dragged);
  const at = order.indexOf(target);
  if (from < 0 || at < 0) return null;
  const side = zone === 'inside' ? (fraction < 0.5 ? 'before' : 'after') : zone;
  const rest = order.filter((id) => id !== dragged);
  const index = rest.indexOf(target) + (side === 'after' ? 1 : 0);
  const after = index === 0 ? null : (rest[index - 1] ?? null);
  const stays = from === index;
  return stays ? null : { section: dragged, after };
}
