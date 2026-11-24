// The insert palette (spec 4b, R6; plan 14, task D5): kit components with their examples, icons, and
// sections of other drafts; search; a click inserts after the selection, a drag goes to the frame.
// The decisions are pure functions over plain data; `mountPalette` only draws and wires events.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Palette, Structure } from '../../../../src/studio/api/edit/structure-schemas.ts';
import type { Place } from '../../../channel/structure-protocol.ts';
import { icon } from '../../ui/icon.ts';
import { getPalette } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { forwardDrag } from '../select/forward.ts';
import type { Gesture } from '../store.ts';
import { text } from '../texts.ts';
import { groupByCategory, groupTitle } from './groups.ts';
import { type TileOptions, tileGroup, tileView } from './tile.ts';

/** Where a click puts the new thing, relative to the selected element. */
export type Where = 'before' | 'after' | 'inside';
const WHERES: readonly Where[] = ['before', 'after', 'inside'];

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

const partName = (item: Item): string =>
  item.kind === 'component' ? (item.component.parent ?? '') : '';

export function mountPalette(ctx: EditorContext): void {
  const { store, bridge, panel, history } = ctx;
  const section = panel.querySelector('section[data-edit="palette"]');
  if (!(section instanceof HTMLElement)) return;

  let palette: Palette | null = null;
  let query = '';
  let loading = false;
  let dragging: Item | null = null;
  let suppressClick = false;

  /** Where a click puts the thing; the drag decides for itself at the drop. */
  let where: Where = 'after';

  const head = document.createElement('div');
  head.className = 'k-pad insert-head';
  const title = document.createElement('div');
  title.className = 'k-head';
  const heading = document.createElement('h2');
  heading.textContent = text('palette.title');
  title.append(heading);
  const find = document.createElement('label');
  find.className = 'k-search';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'k-field insert-search';
  search.placeholder = text('palette.search');
  search.setAttribute('aria-label', text('palette.search'));
  find.append(icon('search'), search);
  head.append(title, find);
  const scroll = document.createElement('div');
  scroll.className = 'k-scroll insert-scroll';
  scroll.dataset.insertScroll = '';
  const groups = document.createElement('div');
  groups.className = 'insert-groups';
  scroll.append(groups);
  const note = document.createElement('p');
  note.className = 'insert-note k-meta';
  note.setAttribute('role', 'status');
  note.hidden = true;
  const foot = document.createElement('div');
  foot.className = 'k-actions insert-where';
  const wherePick = document.createElement('div');
  wherePick.className = 'k-seg';
  wherePick.setAttribute('role', 'group');
  wherePick.setAttribute('aria-label', text('palette.where'));
  const whereLabel = document.createElement('span');
  whereLabel.className = 'k-meta';
  whereLabel.textContent = text('palette.where');
  for (const choice of WHERES) {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.dataset.where = choice;
    pick.textContent = text(`palette.where.${choice}`);
    pick.setAttribute('aria-pressed', String(choice === where));
    pick.addEventListener('click', () => {
      where = choice;
      for (const one of wherePick.querySelectorAll('button')) {
        one.setAttribute('aria-pressed', String(one.dataset.where === where));
      }
    });
    wherePick.append(pick);
  }
  foot.append(whereLabel, wherePick);
  section.append(head, scroll, note, foot);

  const say = (message: string | null): void => {
    note.hidden = message === null;
    note.textContent = message ?? '';
  };

  function insert(op: EditOp, name: string): void {
    if (store.get().busy) return;
    // `selectCreated` is read by the history when it has it (task D1); the type may not name it yet.
    const gesture: Gesture & { selectCreated?: boolean } = {
      ops: [op],
      label: text('palette.insert', { name }),
      selectCreated: true,
    };
    void history.apply(gesture);
  }

  function click(item: Item): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const state = store.get();
    if (!state.structure) return;
    const op = opFor(item, state.structure, null, state.selection, where);
    if (op === 'needsProps' && item.kind === 'component') {
      say(text('palette.needsProps', { props: item.component.required.join(', ') }));
    } else if (op === 'partOnly') {
      say(text('palette.partOnly', { parent: partName(item) }));
    } else if (typeof op === 'string') {
      say(text('palette.noTarget'));
    } else {
      say(null);
      insert(op, labelOf(item));
    }
  }

  /** Pointer capture keeps the move events coming while the pointer is over the frame. */
  function wireDrag(button: HTMLElement, item: Item): void {
    let start: { x: number; y: number } | null = null;
    let moving = false;
    const point = (event: PointerEvent): { x: number; y: number } => ({
      x: event.clientX,
      y: event.clientY,
    });
    const finish = (phase: 'end' | 'cancel', event: PointerEvent): void => {
      if (moving) {
        forwardDrag(ctx, phase, point(event));
        suppressClick = true;
        if (phase === 'cancel') dragging = null;
      }
      start = null;
      moving = false;
    };
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      start = point(event);
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (start === null) return;
      if (moving) {
        forwardDrag(ctx, 'move', point(event));
        return;
      }
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= DRAG_THRESHOLD) return;
      moving = true;
      dragging = item;
      forwardDrag(ctx, 'start', point(event), { kind: 'insert', label: labelOf(item) });
    });
    button.addEventListener('pointerup', (event) => finish('end', event));
    button.addEventListener('pointercancel', (event) => finish('cancel', event));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !moving) return;
      forwardDrag(ctx, 'cancel', { x: 0, y: 0 });
      dragging = null;
      suppressClick = true;
      start = null;
      moving = false;
    });
  }

  function row(item: Item, label: string, options: TileOptions): HTMLLIElement {
    const { li, button } = tileView(label, options);
    button.addEventListener('click', () => click(item));
    if (!options.disabled) wireDrag(button, item);
    return li;
  }

  function componentRow(component: PaletteComponent): HTMLLIElement {
    const needs = codeOf(component) === null;
    const hint = needs
      ? text('palette.needsProps', { props: component.required.join(', ') })
      : component.category;
    return row({ kind: 'component', component }, component.name, {
      hint,
      disabled: needs,
      part: component.parent !== null,
      icon: 'component',
    });
  }

  function render(): void {
    groups.replaceChildren();
    if (!palette) return;
    const shown = filterPalette(palette, query);
    const add = (title: string, tiles: HTMLLIElement[]): void => {
      const made = tileGroup(title, tiles);
      if (made) groups.append(made);
    };
    // The kit's components by category, in the order the kit lists them.
    for (const group of groupByCategory(shown.components, text('palette.components'))) {
      add(groupTitle(group.category), group.items.map(componentRow));
    }
    const iconComponent = palette.icons?.component ?? '';
    add(
      text('palette.icons'),
      shown.icons
        .filter((name) => iconCode(iconComponent, name) !== null)
        .map((name) =>
          row({ kind: 'icon', component: iconComponent, name }, name, {
            hint: null,
            disabled: false,
            part: false,
            icon: null,
          }),
        ),
    );
    add(
      text('palette.sections'),
      shown.sections.map((entry) => {
        const from = text('palette.from', { slug: entry.slug });
        return row(
          { kind: 'section', slug: entry.slug, section: entry.section, purpose: entry.purpose },
          entry.section,
          { hint: `${entry.purpose} (${from})`, disabled: false, part: false, icon: 'section' },
        );
      }),
    );
    if (groups.childElementCount === 0) {
      const empty = document.createElement('p');
      empty.className = 'k-empty insert-empty';
      empty.textContent = text('palette.none');
      groups.append(empty);
    }
  }

  async function load(): Promise<void> {
    if (palette || loading) return;
    loading = true;
    const answer = await getPalette(ctx.slug);
    loading = false;
    if (answer.ok) {
      palette = answer.body;
      render();
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  bridge.on((message) => {
    if (message.type !== 'drop' || message.source.kind !== 'insert' || dragging === null) return;
    const item = dragging;
    if (message.source.label !== labelOf(item)) return;
    dragging = null;
    const state = store.get();
    if (!state.structure) return;
    const slot = { anchor: message.anchor, place: message.place };
    const op = dropOp(item, state.structure, slot, state.selection);
    if (op === null) {
      say(text('palette.partOnly', { parent: partName(item) }));
      return;
    }
    say(null);
    insert(op, labelOf(item));
  });

  store.subscribe((state, previous) => {
    if (state.on && !previous.on) void load();
  });
  if (store.get().on) void load();
}
