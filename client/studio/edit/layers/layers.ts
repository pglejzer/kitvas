// The layers tree with readable names and search (plan 13, task F; plan 18, task B). The pane
// host is `div[data-edit="layers"]`: a head with a search field, then the part that scrolls. The
// row's markup is `row.ts`, its facts are `facts.ts`; this file holds the tree, the drag and the keys.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { TreeNode } from '../../../channel/edit-protocol.ts';
import { icon } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { filterTree, nextSelection } from '../select/selection.ts';
import type { EditorState } from '../store.ts';
import { type ListKind, listOf } from '../structure/lists.ts';
import { text } from '../texts.ts';
import { changedIds, type Listed, listKindOf, nestTree } from './facts.ts';
import { layerRow, type RowEnv, type Section } from './row.ts';
import { isNoop, type Row, sectionDrop, treeDrop, type Zone, zoneOf } from './tree-drag.ts';

export {
  badgeCount,
  badgeOf,
  changedIds,
  type LayerItem,
  listKindOf,
  nestTree,
  type RowFacts,
  rowFacts,
} from './facts.ts';

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

type Press = { id: string; section: string | null; x: number; y: number; active: boolean };
type Target = { el: HTMLElement; zone: Zone; fraction: number };

/** The ids in `current` with `id` put in or taken out. */
function toggled(current: readonly string[], id: string): string[] {
  return current.includes(id) ? current.filter((one) => one !== id) : [...current, id];
}

export function mountLayers(ctx: EditorContext): void {
  const { store, bridge, panel, history } = ctx;
  const section = panel.querySelector('[data-edit="layers"]');
  if (!(section instanceof HTMLElement)) return;

  let query = '';
  let press: Press | null = null;
  let target: Target | null = null;
  /** The kinds of list the inspects of this page told, by element. */
  const kinds = new Map<string, ListKind>();
  // A drag ends with a click on the row it started on; that click must not select.
  let swallowClick = false;

  const head = document.createElement('div');
  head.className = 'k-pad layers-head';
  const title = document.createElement('div');
  title.className = 'k-head';
  const heading = document.createElement('h2');
  heading.textContent = text('layers.title');
  title.append(heading);
  const find = document.createElement('label');
  find.className = 'k-search';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'k-field layers-search';
  search.placeholder = text('layers.search');
  search.setAttribute('aria-label', text('layers.search'));
  find.append(icon('search'), search);
  head.append(title, find);
  const scroll = document.createElement('div');
  scroll.className = 'k-scroll layers-scroll';
  const list = document.createElement('ul');
  list.className = 'layers-tree';
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', text('layers.title'));
  scroll.append(list);
  section.append(head, scroll);

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

  function env(state: EditorState): RowEnv {
    const listed = new Map(
      (state.structure?.elements ?? []).map((entry): [string, Listed] => [entry.id, entry]),
    );
    return {
      selected: new Set(state.selection),
      hidden: new Set(state.hidden),
      locked: new Set(state.locked),
      sections: sectionsByElement(),
      components: new Map(
        (state.structure?.elements ?? []).map((entry) => [entry.id, entry.component]),
      ),
      changed: changedIds(state.changes),
      kindOf: (id) => listKindOf(listed.get(id), kinds, id),
      swallowClick: () => swallowClick,
      select(id, add) {
        store.set({ selection: nextSelection(store.get().selection, { id, add }) });
      },
      press(node, sectionId, event) {
        if (event.button !== 0 || store.get().busy) return;
        const at = { x: event.clientX, y: event.clientY };
        press = { id: node.id, section: sectionId, ...at, active: false };
      },
      hover: (id) => bridge.send({ type: 'hover', id }),
      toggleHidden(id) {
        const next = toggled(store.get().hidden, id);
        store.set({ hidden: next });
        bridge.send({ type: 'hide', ids: next });
      },
      toggleLocked(id) {
        const next = toggled(store.get().locked, id);
        store.set({ locked: next });
        bridge.send({ type: 'lock', ids: next });
      },
    };
  }

  function render(): void {
    const state = store.get();
    const nodes: TreeNode[] = filterTree(state.tree, query);
    // Rebuilding the list must not drop the keyboard focus from the row the person used.
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && list.contains(active) ? active.dataset.layer : null;
    list.replaceChildren();
    if (nodes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'k-empty layers-empty';
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
    const rowEnv = env(state);
    for (const item of nestTree(nodes)) list.append(layerRow(item, 1, rowEnv));
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

  /** Keeps what kind of list an inspected element is in; `true` when that is news. */
  function learn(state: EditorState): boolean {
    const kind = listOf(state.inspected)?.kind;
    const id = state.inspected?.id;
    if (kind === undefined || id === undefined || kinds.get(id) === kind) return false;
    kinds.set(id, kind);
    return true;
  }

  store.subscribe((state, previous) => {
    const learned = state.inspected !== previous.inspected && learn(state);
    const changed =
      learned ||
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
