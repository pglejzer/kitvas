// The context menu on the prototype and in the tree (spec 4b, R4; plan 14, task D3): every action of
// `actions.ts`, off with its reason when it cannot run. It opens from the frame's `menu` message,
// a right click in the tree (the `edit-menu` event of the layers panel), Shift+F10 and the menu key.
// A `.k-pop.k-menu` that rises in; an item has an icon only where its action has one in
// `MENU_ICONS`, its key as a `.k-kbd` (plan 18, task D).

import type { IconName } from '../../../../src/studio/pages/icons/paths.ts';
import { isMac, shortcutHint } from '../../shell/shortcuts.ts';
import { icon } from '../../ui/icon.ts';
import { getPalette } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { NOTE_EVENT } from '../notes/model.ts';
import { refOf, sameChosen } from '../select/copies.ts';
import type { EditorState, Menu } from '../store.ts';
import { text } from '../texts.ts';
import { type ActionId, type ActionState, actionsFor, runAction } from './actions.ts';
import { partTarget } from './list-parts.ts';
import { itemTarget, LIST_ACTIONS } from './lists.ts';
import { clampToView, menuSelection, toPageBox, toPagePoint } from './menu-place.ts';

export {
  type Box,
  clampToView,
  menuSelection,
  selectionFor,
  toPageBox,
  toPagePoint,
} from './menu-place.ts';

/** One line of the menu as drawn: a label, and the reason when it is off. */
export type MenuItem = {
  /** The action, or `null` in the list of components that `replace` opens. */
  action: ActionId | null;
  /** A kit component to replace with, in that list. */
  tag: string | null;
  label: string;
  enabled: boolean;
  reason: string | null;
  /** Its key, as the list of shortcuts shows it (`Ctrl+D`); `null` for an action without one. */
  hint: string | null;
  /** A divider is drawn before the item when its group differs from the one before. */
  group: number;
  /** "Note…" (spec 4d, goal 3): opens the note form of `notes/` (task C). */
  note?: true;
};

/** "Note…", last: a note on the element the menu is for, or on the draft. */
const noteItem = (): MenuItem => ({
  action: null,
  tag: null,
  label: text('menu.note'),
  enabled: true,
  reason: null,
  hint: null,
  group: 7,
  note: true,
});

/** Related actions sit together, with a divider between the groups. */
const GROUPS: Record<ActionId, number> = {
  delete: 0,
  duplicate: 0,
  copy: 1,
  'copy-location': 1,
  cut: 1,
  paste: 1,
  'move-up': 2,
  'move-down': 2,
  'wrap-stack': 3,
  'wrap-row': 3,
  'wrap-grid': 3,
  'wrap-card': 3,
  unwrap: 3,
  replace: 4,
  reset: 4,
  'copy-style': 5,
  'paste-style': 5,
  'select-similar': 5,
  hide: 6,
  'show-all': 6,
  lock: 6,
  unlock: 6,
};

/** The shortcut of an action whose id differs from its line in the list of shortcuts. */
const SHORTCUT_OF: Partial<Record<ActionId, string>> = { 'wrap-stack': 'wrap' };

/**
 * The actions drawn with an icon: only those the studio's icons show plainly. Every other item
 * keeps the icon's place empty, so the labels line up.
 */
export const MENU_ICONS: Partial<Record<ActionId | 'note', IconName>> = {
  delete: 'trash',
  duplicate: 'duplicate',
  copy: 'copy',
  'move-up': 'arrow-up',
  'move-down': 'arrow-down',
  hide: 'eye-off',
  'show-all': 'eye',
  lock: 'lock',
  unlock: 'unlock',
  note: 'note',
};

/** The icon of an item; `null` for an item without one (a component of `replace` among them). */
export function menuIcon(item: Pick<MenuItem, 'action' | 'note'>): IconName | null {
  if (item.note === true) return MENU_ICONS.note ?? null;
  return item.action === null ? null : (MENU_ICONS[item.action] ?? null);
}

/**
 * The items for the actions of the moment. "Show all" only matters while something is hidden.
 * The key hints come from the list of shortcuts, so the two never disagree. `listItem`: the
 * selection is an item of a data list, so Move, Duplicate and Delete say they act on the item.
 * `part`: it is a part of a list item, an element of the template, so they say every item changes.
 */
export function menuItems(
  actions: readonly ActionState[],
  hiddenCount: number,
  mac = false,
  listItem = false,
  part = false,
): MenuItem[] {
  const group = listItem ? 'menu.list' : part ? 'menu.part' : 'menu';
  const labelOf = (id: ActionId): string =>
    text(LIST_ACTIONS.has(id) ? `${group}.${id}` : `menu.${id}`);
  return (
    actions
      .filter((action) => action.id !== 'show-all' || hiddenCount > 0)
      // Lock and Unlock: only the one that applies to the selection.
      .filter((action) => (action.id !== 'lock' && action.id !== 'unlock') || action.enabled)
      .map((action) => ({
        action: action.id,
        tag: null,
        label: labelOf(action.id),
        enabled: action.enabled,
        reason:
          action.enabled || action.reason === null ? null : text(`menu.reason.${action.reason}`),
        hint: shortcutHint(SHORTCUT_OF[action.id] ?? action.id, mac, (key) => text(key)),
        group: GROUPS[action.id],
      }))
  );
}

/** The list `replace` opens: one item per kit component (parts such as `Card.Header` are left out). */
export function componentItems(
  components: readonly { name: string; parent: string | null }[],
  current: string | null,
): MenuItem[] {
  return components
    .filter((component) => component.parent === null && component.name !== current)
    .map((component) => ({
      action: null,
      tag: component.name,
      label: component.name,
      enabled: true,
      reason: null,
      hint: null,
      group: 0,
    }));
}

/** The next focused item: arrow keys skip items that are off and wrap around; `-1` when none is on. */
export function stepIndex(items: readonly MenuItem[], from: number, key: string): number {
  const on = items.map((item, index) => (item.enabled ? index : -1)).filter((index) => index >= 0);
  if (on.length === 0) return -1;
  if (key === 'Home') return on[0] ?? -1;
  if (key === 'End') return on[on.length - 1] ?? -1;
  const after = on.filter((index) => (key === 'ArrowDown' ? index > from : index < from));
  if (key === 'ArrowDown') return after[0] ?? on[0] ?? -1;
  return after[after.length - 1] ?? on[on.length - 1] ?? -1;
}

/** Two lists of items draw the same menu. */
export function sameItems(a: readonly MenuItem[], b: readonly MenuItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What Enter does on the focused item: `null` when nothing is focused or the item is off. */
export function activate(items: readonly MenuItem[], index: number): MenuItem | null {
  const item = items[index];
  return item?.enabled ? item : null;
}

/** Opens the menu on the page at page pixels; `from` is what a frame's `menu` message adds. */
export function openMenuAt(
  ctx: EditorContext,
  id: string | null,
  x: number,
  y: number,
  from: { item?: number; path?: number[]; box?: NonNullable<Menu['box']> } = {},
): void {
  const state = ctx.store.get();
  if (!state.on) return;
  const next = menuSelection(state, id, from);
  const changed = !sameChosen(next, state);
  const copy =
    id !== null && (from.item !== undefined || from.path !== undefined)
      ? { copy: refOf(id, from) }
      : {};
  const box = from.box === undefined ? {} : { box: from.box };
  ctx.store.set({
    menu: { id, x, y, ...copy, ...box },
    ...(changed ? { selection: next.selection, copies: next.copies } : {}),
  });
}

/** Where the menu key opens it: near the frame's top left corner, as the key has no pointer. */
export function openMenuFromKey(ctx: EditorContext): void {
  const box = ctx.bridge.frame.element.getBoundingClientRect();
  openMenuAt(ctx, ctx.store.get().selection[0] ?? null, box.left + 16, box.top + 16);
}

type MenuAsked = { id: string | null; x: number; y: number };

function isEventWithMenu(event: Event): event is CustomEvent<MenuAsked> {
  if (!(event instanceof CustomEvent)) return false;
  const detail: unknown = event.detail;
  if (typeof detail !== 'object' || detail === null) return false;
  const { id, x, y } = detail as Record<string, unknown>;
  return (id === null || typeof id === 'string') && typeof x === 'number' && typeof y === 'number';
}

export function mountMenu(ctx: EditorContext): void {
  const { store, bridge } = ctx;
  const root = ctx.main.querySelector('div[data-edit="menu"]');
  if (!(root instanceof HTMLElement)) return;
  const element = root;
  element.classList.add('k-pop', 'k-menu', 'menu-root');
  let items: MenuItem[] = [];
  let focused = -1;
  /** The kit's components once `replace` was chosen; `null` while the actions are shown. */
  let replacing: MenuItem[] | null = null;
  let palette: { name: string; parent: string | null }[] | null = null;

  function close(): void {
    if (store.get().menu) store.set({ menu: null });
  }

  function focusItem(index: number): void {
    focused = index;
    const buttons = element.querySelectorAll<HTMLButtonElement>('button[data-menu-item]');
    buttons[index]?.focus();
  }

  function draw(): void {
    element.replaceChildren();
    element.setAttribute('role', 'menu');
    let group = -1;
    items.forEach((item, index) => {
      if (index > 0 && item.group !== group) {
        const divider = document.createElement('div');
        divider.className = 'k-menu-sep';
        divider.setAttribute('role', 'separator');
        element.append(divider);
      }
      group = item.group;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'k-menu-item menu-item';
      button.setAttribute('role', 'menuitem');
      button.dataset.menuItem = item.action ?? item.tag ?? (item.note ? 'note' : '');
      button.tabIndex = -1;
      button.setAttribute('aria-disabled', String(!item.enabled));
      const mark = document.createElement('span');
      mark.className = 'menu-icon';
      const name = menuIcon(item);
      if (name !== null) mark.append(icon(name));
      const words = document.createElement('span');
      words.className = 'menu-text';
      const label = document.createElement('span');
      label.textContent = item.label;
      words.append(label);
      if (item.reason !== null) {
        const reason = document.createElement('span');
        reason.className = 'k-meta menu-reason';
        reason.textContent = item.reason;
        words.append(reason);
      }
      button.append(mark, words);
      if (item.hint !== null) {
        const hint = document.createElement('kbd');
        hint.className = 'k-kbd';
        hint.textContent = item.hint;
        button.append(hint);
      }
      button.addEventListener('click', () => choose(item));
      button.addEventListener('pointermove', () => {
        if (item.enabled && focused !== index) focusItem(index);
      });
      element.append(button);
    });
  }

  function place(menu: NonNullable<EditorState['menu']>): void {
    element.hidden = false;
    const size = { width: element.offsetWidth, height: element.offsetHeight };
    const at = clampToView({ x: menu.x, y: menu.y }, size, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    element.style.left = `${at.x}px`;
    element.style.top = `${at.y}px`;
  }

  /** The actions of the moment as items, with "Note…" last. */
  function itemsOf(state: EditorState): MenuItem[] {
    const listItem = itemTarget(state) !== null;
    const part = partTarget(state) !== null;
    const mac = isMac(navigator.platform);
    const actions = menuItems(actionsFor(state), state.hidden.length, mac, listItem, part);
    return [...actions, noteItem()];
  }

  function show(state: EditorState): void {
    const menu = state.menu;
    if (!menu) return;
    replacing = null;
    items = itemsOf(state);
    draw();
    place(menu);
    focusItem(stepIndex(items, -1, 'ArrowDown'));
  }

  /**
   * What a right click selected is read a moment after the menu opens: the facts of a list item
   * come from the studio. The items follow them, so "Delete item" never stays switched off.
   */
  function follow(state: EditorState): void {
    const menu = state.menu;
    if (!menu || replacing !== null) return;
    const next = itemsOf(state);
    if (sameItems(next, items)) return;
    items = next;
    draw();
    place(menu);
    focusItem(stepIndex(items, -1, 'ArrowDown'));
  }

  async function showComponents(): Promise<void> {
    if (palette === null) {
      const answer = await getPalette(ctx.slug);
      palette = answer.ok ? answer.body.components : [];
    }
    const menu = store.get().menu;
    if (!menu) return;
    const current = store.get().inspected?.component?.name ?? null;
    replacing = componentItems(palette, current);
    items = replacing;
    draw();
    place(menu);
    focusItem(items.length > 0 ? 0 : -1);
  }

  function choose(item: MenuItem): void {
    if (!item.enabled) return;
    if (item.note === true) {
      const id = store.get().menu?.id ?? store.get().selection[0] ?? null;
      close();
      document.dispatchEvent(new CustomEvent(NOTE_EVENT, { detail: { id } }));
    } else if (item.tag !== null) {
      close();
      void runAction(ctx, 'replace', { tag: item.tag });
    } else if (item.action === 'replace') {
      void showComponents();
    } else if (item.action !== null) {
      const action = item.action;
      close();
      void runAction(ctx, action);
    }
  }

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const item = activate(items, focused);
      if (item) choose(item);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      focusItem(stepIndex(items, focused, event.key));
    } else if (event.key === 'Tab') {
      close();
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && store.get().menu) {
      event.preventDefault();
      close();
    }
  });
  // A click outside the menu closes it; the capture phase sees it before the target does.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (store.get().menu && !(event.target instanceof Node && element.contains(event.target))) {
        close();
      }
    },
    true,
  );
  // A click in the frame never reaches this page's listeners: the focus going into the frame, a pick
  // or a key there closes the menu instead.
  window.addEventListener('blur', close);
  document.addEventListener('edit-menu', (event) => {
    if (!isEventWithMenu(event)) return;
    // A right click in Layers while previewing switches to Edit first, as the Edit button does.
    if (!store.get().on) {
      const edit = ctx.main.querySelector<HTMLButtonElement>('button[data-shell-mode="edit"]');
      if (!edit || edit.disabled) return;
      edit.click();
    }
    openMenuAt(ctx, event.detail.id, event.detail.x, event.detail.y);
  });

  bridge.on((message) => {
    if (message.type === 'pick' || message.type === 'key') {
      close();
      return;
    }
    if (message.type !== 'menu') return;
    const box = bridge.frame.element.getBoundingClientRect();
    const zoom = store.get().zoom;
    const at = toPagePoint(box, zoom, message);
    openMenuAt(ctx, message.id, at.x, at.y, {
      ...(message.item === undefined ? {} : { item: message.item }),
      ...(message.path === undefined ? {} : { path: message.path }),
      ...(message.box === undefined ? {} : { box: toPageBox(box, zoom, message.box) }),
    });
  });

  store.subscribe((state, previous) => {
    if (state.menu === previous.menu) {
      follow(state);
      return;
    }
    if (state.menu) {
      show(state);
    } else {
      element.hidden = true;
      element.replaceChildren();
      replacing = null;
    }
  });
  // Leaving edit mode, or a conflict, takes the menu away.
  store.subscribe((state) => {
    if (!state.on && state.menu) close();
  });
}
