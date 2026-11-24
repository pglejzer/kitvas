// The layers tree with readable names and search (plan 13, task F). Built with
// `createElement` and `textContent` only: names come from the page being edited.

import type { EditOp } from '../../../src/edit/index.ts';
import type { TreeNode } from '../../channel/edit-protocol.ts';
import type { EditorContext } from './context.ts';
import { filterTree, nextSelection } from './selection.ts';
import type { ChangeEntry } from './store.ts';
import { text } from './texts.ts';
import { isNoop, type Row, sectionDrop, treeDrop, type Zone, zoneOf } from './tree-drag.ts';

export type LayerItem = { node: TreeNode; children: LayerItem[] };

/** The pointer must move this far (page pixels) before a press on a row becomes a drag. */
const DRAG_THRESHOLD = 4;

/**
 * The ops of dropping `ids` (in document order) at one place: each element goes to the same place,
 * or after the one moved before it, so the group keeps its order. Ids name elements as they are now.
 */
export function moveOps(
  ids: readonly string[],
  drop: { anchor: string; place: 'before' | 'after' | 'last' },
  hashes: ReadonlyMap<string, string>,
): EditOp[] {
  return ids.map((id, index) => {
    const hash = hashes.get(id);
    const previous = ids[index - 1];
    const anchor = drop.place === 'after' && previous !== undefined ? previous : drop.anchor;
    return {
      op: 'moveElement',
      id,
      anchor,
      place: anchor === drop.anchor ? drop.place : 'after',
      ...(hash === undefined ? {} : { hash }),
    };
  });
}

/** The "× n" badge shows for an item of a mapped list only; the count, or `null`. */
export function badgeCount(node: TreeNode): number | null {
  return node.count > 1 ? node.count : null;
}

/** The elements the person changed in this session, from the change list's ids. */
export function changedIds(changes: readonly ChangeEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const change of changes) {
    if (change.by === 'person' && change.id !== null) ids.add(change.id);
  }
  return ids;
}

/** What a row shows besides its name: the kit marker, the "× n" badge and the changed dot. */
export type RowFacts = { kit: boolean; count: number | null; changed: boolean };

/** `component` is the structure's kit component of the element (`null`: a plain element). */
export function rowFacts(
  node: TreeNode,
  component: string | null | undefined,
  changed: ReadonlySet<string>,
): RowFacts {
  return {
    kit: component !== null && component !== undefined,
    count: badgeCount(node),
    changed: changed.has(node.id),
  };
}

/** Nests a flat tree in document order; a node whose parent is not in the list is a root. */
export function nestTree(nodes: TreeNode[]): LayerItem[] {
  const items = new Map<string, LayerItem>();
  for (const node of nodes) items.set(node.id, { node, children: [] });
  const roots: LayerItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id);
    if (!item) continue;
    const parent = node.parent === null ? undefined : items.get(node.parent);
    (parent ? parent.children : roots).push(item);
  }
  return roots;
}

type Section = { id: string; purpose: string };
type Press = { id: string; section: string | null; x: number; y: number; active: boolean };
type Target = { el: HTMLElement; zone: Zone; fraction: number };

export function mountLayers(ctx: EditorContext): void {
  const { store, bridge, panel, history } = ctx;
  const section = panel.querySelector('section[data-edit="layers"]');
  if (!(section instanceof HTMLElement)) return;

  let query = '';
  let press: Press | null = null;
  let target: Target | null = null;
  // A drag ends with a click on the row it started on; that click must not select.
  let swallowClick = false;

  const heading = document.createElement('h2');
  heading.textContent = text('layers.title');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'layers-search';
  search.placeholder = text('layers.search');
  search.setAttribute('aria-label', text('layers.search'));
  const list = document.createElement('ul');
  list.className = 'layers-tree';
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', text('layers.title'));
  section.append(heading, search, list);

  /** Section rows: the elements of `index.tsx` that render a layout section. */
  function sectionsByElement(): Map<string, Section> {
    const found = new Map<string, Section>();
    for (const entry of store.get().structure?.sections ?? []) {
      if (entry.element !== null) found.set(entry.element, entry);
    }
    return found;
  }

  const rowsOf = (): Map<string, Row> =>
    new Map((store.get().structure?.elements ?? []).map((entry) => [entry.id, entry]));

  function eye(id: string, hidden: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layers-eye';
    button.dataset.eye = id;
    button.setAttribute('aria-pressed', String(hidden));
    const label = text(hidden ? 'layers.show' : 'layers.hide');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = hidden ? '○' : '●';
    button.addEventListener('click', () => {
      const current = store.get().hidden;
      const next = current.includes(id) ? current.filter((one) => one !== id) : [...current, id];
      store.set({ hidden: next });
      bridge.send({ type: 'hide', ids: next });
    });
    return button;
  }

  /** The lock toggle: a locked element is picked in Layers only, never on the canvas. */
  function padlock(id: string, locked: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layers-lock';
    button.dataset.lock = id;
    button.setAttribute('aria-pressed', String(locked));
    const label = text(locked ? 'layers.unlock' : 'layers.lock');
    button.setAttribute('aria-label', label);
    button.title = label;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // A body and a shackle; the shackle stands open while unlocked.
    path.setAttribute(
      'd',
      locked ? 'M3 5.5V4a3 3 0 0 1 6 0v1.5M2 5.5h8v5H2z' : 'M3 5.5V4a3 3 0 0 1 5.8-1M2 5.5h8v5H2z',
    );
    svg.append(path);
    button.append(svg);
    button.addEventListener('click', () => {
      const current = store.get().locked;
      const next = current.includes(id) ? current.filter((one) => one !== id) : [...current, id];
      store.set({ locked: next });
      bridge.send({ type: 'lock', ids: next });
    });
    return button;
  }

  function row(
    item: LayerItem,
    level: number,
    selected: Set<string>,
    sections: Map<string, Section>,
    hidden: Set<string>,
    components: Map<string, string | null>,
    changed: Set<string>,
  ): HTMLLIElement {
    const { node } = item;
    const asSection = level === 1 ? sections.get(node.id) : undefined;
    const li = document.createElement('li');
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(level));
    li.setAttribute('aria-selected', String(selected.has(node.id)));
    if (hidden.has(node.id)) li.dataset.hidden = '';
    const line = document.createElement('div');
    line.className = 'layers-line';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = asSection ? 'layers-row layers-section' : 'layers-row';
    button.dataset.layer = node.id;
    if (asSection) {
      button.dataset.section = asSection.id;
      button.title = asSection.purpose;
    }
    const name = document.createElement('span');
    name.className = 'layers-name';
    name.textContent = asSection ? asSection.id : node.name;
    button.append(name);
    const facts = rowFacts(node, components.get(node.id), changed);
    if (facts.kit) {
      const marker = document.createElement('span');
      marker.className = 'layers-kit';
      marker.title = text('layers.kit');
      marker.setAttribute('aria-label', text('layers.kit'));
      marker.textContent = '◆';
      button.prepend(marker);
    }
    if (facts.count !== null) {
      const badge = document.createElement('span');
      badge.className = 'layers-badge';
      badge.textContent = text('layers.count', { count: facts.count });
      button.append(badge);
    }
    if (facts.changed) {
      const dot = document.createElement('span');
      dot.className = 'layers-dot';
      dot.title = text('layers.changed');
      dot.setAttribute('aria-label', text('layers.changed'));
      button.append(dot);
    }
    button.addEventListener('click', (event) => {
      if (swallowClick) return;
      const state = store.get();
      const selection = nextSelection(state.selection, { id: node.id, add: event.shiftKey });
      store.set({ selection });
    });
    button.addEventListener('mouseenter', () => bridge.send({ type: 'hover', id: node.id }));
    button.addEventListener('mouseleave', () => bridge.send({ type: 'hover', id: null }));
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || store.get().busy) return;
      const at = { x: event.clientX, y: event.clientY };
      press = { id: node.id, section: asSection ? asSection.id : null, ...at, active: false };
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      // The menu (task D3) listens for this; the position is in page pixels. It selects the row
      // itself: selecting here first would draw the tree again and take this button off the page
      // before the event could reach the menu, so the first right click did nothing.
      const detail = { id: node.id, x: event.clientX, y: event.clientY };
      document.dispatchEvent(new CustomEvent('edit-menu', { detail }));
    });
    const locked = store.get().locked.includes(node.id);
    if (locked) li.dataset.locked = '';
    line.append(button, padlock(node.id, locked), eye(node.id, hidden.has(node.id)));
    li.append(line);
    if (item.children.length > 0) {
      const group = document.createElement('ul');
      group.setAttribute('role', 'group');
      for (const child of item.children) {
        group.append(row(child, level + 1, selected, sections, hidden, components, changed));
      }
      li.append(group);
    }
    return li;
  }

  function render(): void {
    const state = store.get();
    const nodes = filterTree(state.tree, query);
    const selected = new Set(state.selection);
    const hidden = new Set(state.hidden);
    // Rebuilding the list must not drop the keyboard focus from the row the person used.
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && list.contains(active) ? active.dataset.layer : null;
    list.replaceChildren();
    if (nodes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'layers-empty';
      // The tree is read from the frame while editing; previewing says so instead of looking empty.
      const key = !state.on
        ? 'layers.off'
        : state.tree.length === 0
          ? 'layers.none'
          : 'layers.nomatch';
      empty.textContent = text(key);
      list.append(empty);
      return;
    }
    const sections = sectionsByElement();
    const components = new Map(
      (state.structure?.elements ?? []).map((entry) => [entry.id, entry.component]),
    );
    const changed = changedIds(state.changes);
    for (const item of nestTree(nodes)) {
      list.append(row(item, 1, selected, sections, hidden, components, changed));
    }
    markHover(state.hovered);
    if (focused) {
      for (const button of list.querySelectorAll<HTMLElement>('.layers-row')) {
        if (button.dataset.layer === focused) button.focus();
      }
    }
  }

  function markHover(id: string | null): void {
    for (const button of list.querySelectorAll<HTMLElement>('.layers-row')) {
      button.toggleAttribute('data-hover', button.dataset.layer === id);
    }
  }

  /** The ids a press on `id` drags: the selection when it holds `id` and shares one parent. */
  function draggedIds(id: string): string[] {
    const state = store.get();
    const rows = rowsOf();
    const parent = rows.get(id)?.parent;
    const together = state.selection.every((one) => rows.get(one)?.parent === parent);
    const ids = state.selection.includes(id) && together ? state.selection : [id];
    const order = (state.structure?.elements ?? []).map((entry) => entry.id);
    return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  /** The element drop a pointer over `id` in `zone` makes; `null` when the rules or a no-op say no. */
  function elementDrop(from: Press, id: string, zone: Zone) {
    const rows = rowsOf();
    const dragged = draggedIds(from.id);
    const drop = treeDrop(rows, dragged, id, zone);
    if (!drop) return null;
    const parent = rows.get(id)?.parent ?? null;
    const siblings = (store.get().structure?.elements ?? [])
      .filter((entry) => entry.parent === parent)
      .map((entry) => entry.id);
    return isNoop(siblings, dragged, drop) ? null : drop;
  }

  function sectionMove(from: Press, over: Target) {
    const id = over.el.dataset.section;
    if (from.section === null || id === undefined) return null;
    const order = (store.get().structure?.sections ?? []).map((entry) => entry.id);
    return sectionDrop(order, from.section, id, over.zone, over.fraction);
  }

  function allowed(from: Press, over: Target): boolean {
    if (from.section !== null) return sectionMove(from, over) !== null;
    return elementDrop(from, over.el.dataset.layer ?? '', over.zone) !== null;
  }

  function clearMarks(): void {
    for (const el of list.querySelectorAll<HTMLElement>('[data-drop]')) delete el.dataset.drop;
    list.classList.remove('layers-dragging');
    target = null;
  }

  function aim(from: Press, event: PointerEvent): void {
    for (const el of list.querySelectorAll<HTMLElement>('[data-drop]')) delete el.dataset.drop;
    target = null;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const el = under instanceof Element ? under.closest<HTMLElement>('.layers-row') : null;
    if (!el || !list.contains(el) || el.dataset.layer === undefined) return;
    const box = el.getBoundingClientRect();
    const fraction = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5;
    const accepts = rowsOf().get(el.dataset.layer)?.accepts ?? false;
    const zone = zoneOf(fraction, from.section === null && accepts);
    target = { el, zone, fraction };
    el.dataset.drop = allowed(from, target) ? zone : 'no';
  }

  function finish(commit: boolean): void {
    const from = press;
    const over = target;
    press = null;
    clearMarks();
    if (!from?.active) return;
    swallowClick = true;
    setTimeout(() => {
      swallowClick = false;
    }, 0);
    if (!commit || !over) return;
    if (from.section !== null) {
      const move = sectionMove(from, over);
      if (!move) return;
      const ops: EditOp[] = [{ op: 'moveSection', section: move.section, after: move.after }];
      void history.apply({ ops, label: text('layers.moveSection') });
      return;
    }
    const drop = elementDrop(from, over.el.dataset.layer ?? '', over.zone);
    if (!drop) return;
    const hashes = new Map((store.get().structure?.elements ?? []).map((e) => [e.id, e.hash]));
    const ops = moveOps(draggedIds(from.id), drop, hashes);
    void history.apply({ ops, label: text('layers.move') });
  }

  document.addEventListener('pointermove', (event) => {
    if (!press) return;
    if (!press.active) {
      const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD;
      if (!far) return;
      press.active = true;
      list.classList.add('layers-dragging');
    }
    aim(press, event);
  });
  // A row press that moves would also select the panel's text on its way; no text is selected
  // while a press is held.
  document.addEventListener('selectstart', (event) => {
    if (press) event.preventDefault();
  });
  document.addEventListener('pointerup', () => finish(true));
  document.addEventListener('pointercancel', () => finish(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && press) finish(false);
  });

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  store.subscribe((state, previous) => {
    const changed =
      state.tree !== previous.tree ||
      state.selection !== previous.selection ||
      state.structure !== previous.structure ||
      state.changes !== previous.changes ||
      state.hidden !== previous.hidden ||
      state.on !== previous.on ||
      state.locked !== previous.locked;
    // A rebuild in the middle of a drag would drop the rows the pointer is over.
    if (changed && !press?.active) render();
    else if (state.hovered !== previous.hovered) markHover(state.hovered);
  });
  render();
}
