// The context menu on the prototype and in the tree (spec 4b, R4; plan 14, task D3): every action of
// `actions.ts`, off with its reason when it cannot run. It opens from the frame's `menu` message,
// a right click in the tree (the `edit-menu` event of the layers panel), Shift+F10 and the menu key.

import { type ActionId, type ActionState, actionsFor, runAction } from './actions.ts';
import { getPalette } from './api.ts';
import type { EditorContext } from './context.ts';
import type { EditorState } from './store.ts';
import { text } from './texts.ts';

/** One line of the menu as drawn: a label, and the reason when it is off. */
export type MenuItem = {
  /** The action, or `null` in the list of components that `replace` opens. */
  action: ActionId | null;
  /** A kit component to replace with, in that list. */
  tag: string | null;
  label: string;
  enabled: boolean;
  reason: string | null;
  /** A divider is drawn before the item when its group differs from the one before. */
  group: number;
};

/** Related actions sit together, with a divider between the groups. */
const GROUPS: Record<ActionId, number> = {
  delete: 0,
  duplicate: 0,
  copy: 1,
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
};

/** The items for the actions of the moment. "Show all" only matters while something is hidden. */
export function menuItems(actions: readonly ActionState[], hiddenCount: number): MenuItem[] {
  return actions
    .filter((action) => action.id !== 'show-all' || hiddenCount > 0)
    .map((action) => ({
      action: action.id,
      tag: null,
      label: text(`menu.${action.id}`),
      enabled: action.enabled,
      reason:
        action.enabled || action.reason === null ? null : text(`menu.reason.${action.reason}`),
      group: GROUPS[action.id],
    }));
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

/** What Enter does on the focused item: `null` when nothing is focused or the item is off. */
export function activate(items: readonly MenuItem[], index: number): MenuItem | null {
  const item = items[index];
  return item?.enabled ? item : null;
}

export type Box = { left: number; top: number };

/** A point in the frame's CSS pixels as page pixels, through the frame's box and the zoom. */
export function toPagePoint(box: Box, zoom: number, point: { x: number; y: number }) {
  return { x: box.left + point.x * zoom, y: box.top + point.y * zoom };
}

/** Keeps the menu on screen: moved left or up by the amount it would stick out. */
export function clampToView(
  at: { x: number; y: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(at.x, view.width - size.width)),
    y: Math.max(0, Math.min(at.y, view.height - size.height)),
  };
}

/** The ids the menu acts on: a right click on an element outside the selection selects it first. */
export function selectionFor(selection: readonly string[], id: string | null): string[] {
  if (id === null || selection.includes(id)) return [...selection];
  return [id];
}

/** Opens the menu on the page at page pixels. */
export function openMenuAt(ctx: EditorContext, id: string | null, x: number, y: number): void {
  const state = ctx.store.get();
  if (!state.on) return;
  const selection = selectionFor(state.selection, id);
  const changed =
    selection.length !== state.selection.length || selection[0] !== state.selection[0];
  ctx.store.set({ menu: { id, x, y }, ...(changed ? { selection } : {}) });
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
        const divider = document.createElement('hr');
        divider.className = 'edit-menu-divider';
        element.append(divider);
      }
      group = item.group;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'edit-menu-item';
      button.setAttribute('role', 'menuitem');
      button.dataset.menuItem = item.action ?? item.tag ?? '';
      button.tabIndex = -1;
      button.setAttribute('aria-disabled', String(!item.enabled));
      const label = document.createElement('span');
      label.textContent = item.label;
      button.append(label);
      if (item.reason !== null) {
        const reason = document.createElement('span');
        reason.className = 'edit-menu-reason';
        reason.textContent = item.reason;
        button.append(reason);
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

  function show(state: EditorState): void {
    const menu = state.menu;
    if (!menu) return;
    replacing = null;
    items = menuItems(actionsFor(state), state.hidden.length);
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
    if (item.tag !== null) {
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
  document.addEventListener('edit-menu', (event) => {
    if (isEventWithMenu(event)) openMenuAt(ctx, event.detail.id, event.detail.x, event.detail.y);
  });

  bridge.on((message) => {
    if (message.type !== 'menu') return;
    const box = bridge.frame.element.getBoundingClientRect();
    const at = toPagePoint(box, store.get().zoom, message);
    openMenuAt(ctx, message.id, at.x, at.y);
  });

  store.subscribe((state, previous) => {
    if (state.menu === previous.menu) return;
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
