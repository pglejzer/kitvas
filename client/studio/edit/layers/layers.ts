// The layers tree with readable names and search (plan 13, task F; plan 18, task B). The pane
// host is `div[data-edit="layers"]`: a head with a search field, then the part that scrolls. The
// row's markup is `row.ts`, its facts are `facts.ts`; this file holds the tree, the drag and the keys.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { TreeNode } from '../../../channel/edit-protocol.ts';
import { icon } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { modeStorage } from '../select/mode-memory.ts';
import { filterTree, nextSelection } from '../select/selection.ts';
import type { EditorState } from '../store.ts';
import { type ListKind, listOf } from '../structure/lists.ts';
import { text } from '../texts.ts';
import { changedIds, type Listed, listKindOf, nestTree } from './facts.ts';
import {
  type Choices,
  isOpen,
  readFolds,
  revealSelection,
  setOpen,
  setSubtree,
  treeKey,
  writeFolds,
} from './folds.ts';
import type { NamedEntry } from './names.ts';
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
/** A drag held this long (ms) over a folded row opens it, so a drop inside it stays possible. */
const SPRING_OPEN_MS = 600;

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

/** Whether a selected element is not in the tree (yet). */
function notInTree(tree: readonly TreeNode[], selection: readonly string[]): boolean {
  const known = new Set(tree.map((node) => node.id));
  return selection.some((id) => !known.has(id));
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
  // The person's fold and open choices, kept for the tab per draft.
  const storage = modeStorage();
  let choices: Choices = readFolds(storage, ctx.slug);
  /** A selected element the tree does not hold yet: its ancestors open when the tree arrives. */
  let revealPending = false;
  /** The folded row a drag hovers, and the timer that opens it. */
  let spring: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;
  let lastMove: PointerEvent | null = null;

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
      named: new Map(
        (state.structure?.elements ?? []).map((entry): [string, NamedEntry] => [
          entry.id,
          { component: entry.component, tag: entry.tag },
        ]),
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
      open: (id, level) => isOpen(id, level, choices, searching()),
      searching: searching(),
      toggle(item, level, whole) {
        if (searching()) return;
        const open = !isOpen(item.node.id, level, choices, false);
        choose(whole ? setSubtree(item, open, choices) : setOpen(item.node.id, open, choices));
      },
    };
  }

  const searching = (): boolean => query.trim() !== '';

  /** Keeps `next` as the choices (and in storage) and draws again; `false` when nothing changed. */
  function choose(next: Choices): boolean {
    if (next === choices) return false;
    choices = next;
    writeFolds(storage, ctx.slug, choices);
    render();
    return true;
  }

  function render(): void {
    const state = store.get();
    const nodes: TreeNode[] = filterTree(state.tree, query);
    // Rebuilding the list must not drop the keyboard focus from the row the person used.
    const active = document.activeElement;
    const inList = active instanceof HTMLElement && list.contains(active) ? active : null;
    const focused = inList?.dataset.layer ?? null;
    const focusedTwist = inList?.dataset.twist ?? null;
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
    if (focusedTwist !== null) {
      for (const button of list.querySelectorAll<HTMLElement>('.layers-twist')) {
        if (button.dataset.twist === focusedTwist) button.focus();
      }
    }
  }

  /** Brings the first selected row into view; only after the selection changed. */
  function scrollToSelection(): void {
    list.querySelector('li[aria-selected="true"] > .layers-line')?.scrollIntoView({
      block: 'nearest',
    });
  }

  /** Opens the ancestors of the selection; draws again when that changed the choices. */
  function reveal(): void {
    const { tree, selection } = store.get();
    revealPending = notInTree(tree, selection);
    const next = revealSelection(tree, selection, choices);
    if (!choose(next)) render();
    scrollToSelection();
  }

  function stopSpring(): void {
    if (spring) clearTimeout(spring.timer);
    spring = null;
  }

  /** A drag over a folded row with children opens it after a short hold (not while searching). */
  function springOpen(el: HTMLElement | null): void {
    const li = el?.closest('li');
    const id = el?.dataset.layer;
    const folded = li?.getAttribute('aria-expanded') === 'false' && !searching();
    if (!folded || id === undefined) {
      stopSpring();
      return;
    }
    if (spring?.id === id) return;
    stopSpring();
    const timer = setTimeout(() => {
      spring = null;
      choose(setOpen(id, true, choices));
      // The rebuild dropped the drop marks; aim again where the pointer is.
      if (press?.active && lastMove) aim(press, lastMove);
    }, SPRING_OPEN_MS);
    spring = { id, timer };
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
    lastMove = null;
    stopSpring();
  }

  function aim(from: Press, event: PointerEvent): void {
    for (const el of list.querySelectorAll<HTMLElement>('[data-drop]')) delete el.dataset.drop;
    target = null;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const el = under instanceof Element ? under.closest<HTMLElement>('.layers-row') : null;
    if (!el || !list.contains(el) || el.dataset.layer === undefined) {
      stopSpring();
      return;
    }
    // Only element rows spring open: a section move has no inside to drop into.
    springOpen(from.section === null ? el : null);
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
    lastMove = event;
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

  // The WAI-ARIA tree keys on a focused name button. Plain arrows only: the editor's global keys
  // use Alt+Arrow (move the element), and they skip an event this handler already took.
  list.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const row = event.target instanceof HTMLElement ? event.target.closest('.layers-row') : null;
    const li = row?.closest('li');
    if (!(row instanceof HTMLElement) || !li) return;
    const id = row.dataset.layer;
    const expanded = li.getAttribute('aria-expanded');
    const above = li.parentElement?.closest('li') ?? null;
    const action = treeKey(event.key, {
      hasChildren: expanded !== null,
      open: expanded === 'true',
      hasParent: above !== null,
    });
    if (action === null || id === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'first-child') li.querySelector<HTMLElement>(':scope > ul .layers-row')?.focus();
    else if (action === 'parent') above?.querySelector<HTMLElement>('.layers-row')?.focus();
    // While searching every row is drawn open; there is nothing to open or fold.
    else if (!searching()) choose(setOpen(id, action === 'open', choices));
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
    // A new selection (here or on the canvas) opens its ancestors and scrolls to its row.
    const picked =
      state.selection !== previous.selection || (revealPending && state.tree !== previous.tree);
    if (picked && !press?.active) {
      reveal();
      return;
    }
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
  {
    const { tree, selection } = store.get();
    revealPending = notInTree(tree, selection);
    choices = revealSelection(tree, selection, choices);
  }
  render();
}
