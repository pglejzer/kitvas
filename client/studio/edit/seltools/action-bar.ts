// The action bar on the selection (redesign spec, goal 12; plan 19, task 4; mock v10 `.seltool`):
// the element's name with the component icon (the box icon for a plain element), or "3
// elements"; then Ask Claude (the cursor goes to the ask bar), Duplicate, Lock or Unlock, and More
// (the context menu, opened at the button). An action that is off keeps its place, says its
// reason as its title, as the menu does, and says it over the canvas when pressed. A toolbar with
// one tab stop: its own arrow keys move between the buttons and go no further, so they never also
// flip a variant. The words of the moment are `barModel`, pure; `createActionBar` draws them with
// `textContent` only: a name comes from the edited page.

import { isMac, shortcutHint } from '../../shell/shortcuts.ts';
import { icon } from '../../ui/icon.ts';
import { namesOf } from '../ai/names.ts';
import { focusAsk } from '../ask/focus.ts';
import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import type { EditorState } from '../store.ts';
import { actionsFor, runAction } from '../structure/actions.ts';
import { partTarget } from '../structure/list-parts.ts';
import { itemTarget } from '../structure/lists.ts';
import { type MenuItem, menuItems, openMenuAt } from '../structure/menu.ts';
import { text } from '../texts.ts';
import { GAP } from './place.ts';

/** One of the bar's action buttons as drawn: its words, whether it runs, and why not. */
export type BarAction = {
  id: 'duplicate' | 'lock' | 'unlock';
  label: string;
  enabled: boolean;
  /** Why it is off, in the menu's words; `null` while it runs. */
  reason: string | null;
  /** Its key as the list of shortcuts says it (`Ctrl+D`); `null` without one. */
  hint: string | null;
};

export type BarModel = {
  /** The component's name, the layer's name, or "3 elements". */
  name: string;
  /** One element that is a kit component: its icon is the component's. */
  component: boolean;
  /** How many elements are selected. */
  count: number;
  duplicate: BarAction;
  /** Lock while any selected element is free, else Unlock. */
  lock: BarAction;
};

/** The name the bar shows: a kit component's name, else the layer's (`namesOf`). */
export function selectionName(state: Pick<EditorState, 'selection' | 'tree' | 'structure'>): {
  name: string;
  component: boolean;
  count: number;
} {
  const ids = [...new Set(state.selection)];
  const [first] = ids;
  if (ids.length !== 1 || first === undefined) {
    return { name: text('seltools.many', { n: ids.length }), component: false, count: ids.length };
  }
  const component = state.structure?.elements.find((entry) => entry.id === first)?.component;
  if (component) return { name: component, component: true, count: 1 };
  return { name: namesOf(state.tree)(first), component: false, count: 1 };
}

const asAction = (item: MenuItem | undefined, id: BarAction['id']): BarAction => ({
  id,
  label: item?.label ?? text(`menu.${id}`),
  enabled: item?.enabled ?? false,
  reason: item?.reason ?? null,
  hint: item?.hint ?? null,
});

/** What the bar shows for the editor's state: the menu's own items, so the two never disagree. */
export function barModel(state: EditorState, mac: boolean): BarModel {
  const listItem = itemTarget(state) !== null;
  const part = partTarget(state) !== null;
  const items = menuItems(actionsFor(state), state.hidden.length, mac, listItem, part);
  const find = (id: BarAction['id']): MenuItem | undefined =>
    items.find((item) => item.action === id);
  // The menu lists the one of Lock and Unlock that applies.
  const unlock = find('unlock');
  return {
    ...selectionName(state),
    duplicate: asAction(find('duplicate'), 'duplicate'),
    lock: unlock ? asAction(unlock, 'unlock') : asAction(find('lock'), 'lock'),
  };
}

/** A button's title: its words, with its key when it has one ("Duplicate (Ctrl+D)"). */
export function titleOf(label: string, hint: string | null): string {
  return hint === null ? label : text('seltools.withKey', { label, keys: hint });
}

/** The button a toolbar key moves to: arrows wrap, Home and End go to the ends; `null`: not one. */
export function roveIndex(count: number, from: number, key: string): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (from + 1) % count;
  if (key === 'ArrowLeft') return (from - 1 + count) % count;
  return null;
}

/**
 * A toolbar with one tab stop (`roving tabindex`): the arrows, Home and End move between the
 * buttons shown and are kept from the page, so the variant keys and the canvas never hear them.
 */
export function roveButtons(toolbar: HTMLElement, buttons: () => HTMLButtonElement[]): void {
  toolbar.addEventListener('keydown', (event) => {
    const shown = buttons().filter((button) => !button.hidden);
    const from = shown.findIndex((button) => button === document.activeElement);
    const to = roveIndex(shown.length, Math.max(0, from), event.key);
    if (to === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    for (const button of shown) button.tabIndex = -1;
    const target = shown[to];
    if (target) {
      target.tabIndex = 0;
      target.focus();
    }
  });
  toolbar.addEventListener('focusin', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    for (const button of buttons()) button.tabIndex = button === event.target ? 0 : -1;
  });
}

/** An action button shown off keeps its focus and its title; a press says why (`runAction`). */
function setAction(button: HTMLButtonElement, action: BarAction): void {
  button.setAttribute('aria-label', action.label);
  const off = action.reason ?? action.label;
  button.title = action.enabled ? titleOf(action.label, action.hint) : off;
  button.setAttribute('aria-disabled', String(!action.enabled));
}

export type ActionBar = {
  element: HTMLElement;
  render(model: BarModel): void;
  /** The More button, which the menu gives the focus back to. */
  more: HTMLButtonElement;
};

/** `opened`: More opened the context menu (the focus comes back to More when it closes). */
export function createActionBar(ctx: EditorContext, opened: () => void): ActionBar {
  const mac = isMac(navigator.platform);
  const say = (key: string): string => text(key);
  const element = el('div', 'k-pop k-pill sel-bar');
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', text('seltools.bar'));
  const who = el('span', 'sel-who');
  const mark = el('span', 'sel-mark');
  const name = el('span', 'k-clip sel-name');
  who.append(mark, name);
  const ask = el('button', 'k-btn sel-ask', text('seltools.ask'));
  ask.type = 'button';
  ask.title = titleOf(text('seltools.ask'), shortcutHint('ask', mac, say));
  const duplicate = el('button', 'k-icon-btn');
  duplicate.type = 'button';
  duplicate.append(icon('duplicate'));
  const lock = el('button', 'k-icon-btn');
  lock.type = 'button';
  const more = el('button', 'k-icon-btn');
  more.type = 'button';
  more.append(icon('more'));
  more.setAttribute('aria-label', text('seltools.more'));
  more.setAttribute('aria-haspopup', 'menu');
  more.title = titleOf(text('seltools.more'), shortcutHint('menu', mac, say));
  const sep = el('span', 'k-sep');
  sep.setAttribute('role', 'separator');
  sep.setAttribute('aria-orientation', 'vertical');
  element.append(who, sep, ask, duplicate, lock, more);
  const buttons = [ask, duplicate, lock, more];
  for (const button of buttons) button.tabIndex = button === ask ? 0 : -1;
  roveButtons(element, () => buttons);

  let shown: BarModel | null = null;
  let lockIcon: string | null = null;

  ask.addEventListener('click', () => {
    focusAsk();
  });
  duplicate.addEventListener('click', () => {
    void runAction(ctx, 'duplicate');
  });
  lock.addEventListener('click', () => {
    if (shown) void runAction(ctx, shown.lock.id);
  });
  more.addEventListener('click', () => {
    const at = more.getBoundingClientRect();
    openMenuAt(ctx, ctx.store.get().selection[0] ?? null, at.left, at.bottom + GAP);
    if (ctx.store.get().menu !== null) opened();
  });

  return {
    element,
    more,
    render(model) {
      shown = model;
      name.textContent = model.name;
      who.title = model.name;
      const kind = model.component ? 'component' : 'box';
      mark.replaceChildren(...(model.count === 1 ? [icon(kind)] : []));
      setAction(duplicate, model.duplicate);
      setAction(lock, model.lock);
      // The icon is drawn again only when Lock and Unlock change places.
      if (lockIcon !== model.lock.id) {
        lockIcon = model.lock.id;
        lock.replaceChildren(icon(model.lock.id === 'unlock' ? 'unlock' : 'lock'));
      }
    },
  };
}
