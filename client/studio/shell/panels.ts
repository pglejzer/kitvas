// The editor screen's side panels on the page (plan 15, task A): tabs, grips, folding to rails,
// and in a narrow window one panel at a time over the canvas. The rules are `layout.ts`; here they
// meet the page. Widths and folds the person sets are kept per viewer in `localStorage`, and the
// screen works the same when storage is missing or refuses.

import { text } from '../edit/texts.ts';
import {
  clampSide,
  DEFAULT_WIDTH,
  dragWidth,
  fitSides,
  foldBoth,
  foldOnSwitch,
  gripKey,
  MAX_SIDE,
  MIN_SIDE,
  type Mode,
  NARROW_QUERY,
  nextTab,
  openingSide,
  RAIL,
  readSettings,
  SIDES,
  type Side,
  type StorageLike,
  tabFor,
  writeSettings,
} from './layout.ts';

export type Panels = {
  /** `[` and `]`: folds or opens a panel; in a narrow window, opens or closes it over the canvas. */
  toggle(side: Side): void;
  /** Ctrl/Cmd+\ */
  toggleBoth(): void;
  /** Esc: closes the panel open over the canvas, the focus back on its rail; `false` if none. */
  closeOverlay(): boolean;
};

type Parts = {
  aside: HTMLElement;
  grip: HTMLElement | null;
  rail: HTMLElement | null;
  fold: HTMLElement | null;
  tabs: HTMLElement[];
};

type View = { width: number; folded: boolean; tab: string };

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');
const modeOf = (main: HTMLElement): Mode => (main.dataset.mode === 'edit' ? 'edit' : 'preview');

function storageOf(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function partsOf(main: HTMLElement, side: Side): Parts | null {
  const aside = main.querySelector<HTMLElement>(`aside.editor-side[data-side="${side}"]`);
  if (!aside) return null;
  return {
    aside,
    grip: main.querySelector<HTMLElement>(`.editor-grip[data-grip="${side}"]`),
    rail: aside.querySelector<HTMLElement>(`.editor-rail[data-rail="${side}"]`),
    fold: aside.querySelector<HTMLElement>(`.editor-fold[data-fold="${side}"]`),
    tabs: [...aside.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')],
  };
}

const tabIds = (parts: Parts): string[] =>
  parts.tabs.map((tab) => tab.dataset.tab ?? '').filter((id) => id !== '');

const NONE: Panels = { toggle() {}, toggleBoth() {}, closeOverlay: () => false };

export function mountPanels(main: HTMLElement): Panels {
  const left = partsOf(main, 'left');
  const right = partsOf(main, 'right');
  if (!left || !right) return NONE;
  const parts: Record<Side, Parts> = { left, right };
  const storage = storageOf();
  const settings = readSettings(storage);
  let mode = modeOf(main);
  /** The tab last picked per mode, for this page only. */
  const picked: Record<Mode, Partial<Record<Side, string>>> = { preview: {}, edit: {} };
  const start = (side: Side): View => ({
    ...openingSide(settings[side], side, mode),
    tab: tabFor(side, mode, undefined, tabIds(parts[side])),
  });
  const view: Record<Side, View> = { left: start('left'), right: start('right') };
  /** The panel open over the canvas in a narrow window. */
  let overlay: Side | null = null;
  const narrowQuery = window.matchMedia(NARROW_QUERY);
  const narrow = (): boolean => narrowQuery.matches;
  const widths = (): Record<Side, number> => fitSides(view, window.innerWidth);
  const keep = (): void => {
    writeSettings(storage, settings);
  };

  function renderTabs(side: Side): void {
    const { aside, tabs } = parts[side];
    const current = view[side].tab;
    for (const tab of tabs) {
      const on = tab.dataset.tab === current;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const pane of aside.querySelectorAll<HTMLElement>(':scope > [data-pane]')) {
      pane.hidden = pane.dataset.pane !== current;
    }
  }

  function renderRail(side: Side): void {
    const { rail, tabs } = parts[side];
    if (!rail) return;
    const name = tabs.find((tab) => tab.dataset.tab === view[side].tab)?.textContent ?? '';
    const label = rail.querySelector('.editor-rail-name');
    if (label && label.textContent !== name) label.textContent = name;
    rail.setAttribute('aria-label', text('shell.open', { name }));
  }

  function render(): void {
    const shown = widths();
    const isNarrow = narrow();
    for (const side of SIDES) {
      const { aside, grip } = parts[side];
      const { width, folded } = view[side];
      // The variable is the open width: a narrow window's overlay is cut by the skin instead.
      main.style.setProperty(`--editor-${side}`, `${isNarrow ? width : shown[side]}px`);
      aside.toggleAttribute('data-folded', folded);
      aside.toggleAttribute('data-overlay', isNarrow && overlay === side);
      if (grip) {
        grip.hidden = folded;
        const rest = view[other(side)].folded ? RAIL : shown[other(side)];
        grip.setAttribute('aria-valuemin', String(MIN_SIDE));
        grip.setAttribute('aria-valuemax', String(clampSide(MAX_SIDE, window.innerWidth, rest)));
        grip.setAttribute('aria-valuenow', String(shown[side]));
      }
      renderTabs(side);
      renderRail(side);
    }
  }

  const holds = (side: Side, node: Element | null): boolean =>
    node !== null && parts[side].aside.contains(node);

  function focusTab(side: Side): void {
    parts[side].tabs.find((tab) => tab.dataset.tab === view[side].tab)?.focus();
  }

  /** Folds or opens panels the person asked for; the focus leaves a panel that folds. */
  function setFolds(sides: readonly Side[], folded: boolean): void {
    const inside = sides.find((side) => holds(side, document.activeElement));
    for (const side of sides) {
      view[side].folded = folded;
      settings[side].folded = folded;
    }
    keep();
    render();
    if (folded && inside !== undefined) parts[inside].rail?.focus();
  }

  function setOverlay(next: Side | null, giveFocus: boolean): void {
    const was = overlay;
    if (next === was) return;
    overlay = next;
    render();
    if (next !== null && giveFocus) focusTab(next);
    else if (was !== null && giveFocus && holds(was, document.activeElement)) {
      parts[was].rail?.focus();
    }
  }

  function toggle(side: Side): void {
    if (narrow()) setOverlay(overlay === side ? null : side, true);
    else setFolds([side], !view[side].folded);
  }

  function pick(side: Side, tab: string): void {
    picked[mode][side] = tab;
    view[side].tab = tab;
    render();
  }

  /** A width the person set, by drag or key: clamped beside the other panel, and kept. */
  function resize(side: Side, wanted: number, save: boolean): void {
    const rest = view[other(side)].folded ? RAIL : widths()[other(side)];
    const width = clampSide(wanted, window.innerWidth, rest);
    view[side].width = width;
    settings[side].width = width;
    render();
    if (save) keep();
  }

  function mountGrip(side: Side): void {
    const grip = parts[side].grip;
    if (!grip) return;
    let drag: { pointer: number; x: number; start: number } | null = null;
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || view[side].folded) return;
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      drag = { pointer: event.pointerId, x: event.clientX, start: widths()[side] };
      // The frames would take the pointer while it crosses them.
      main.toggleAttribute('data-gripping', true);
      grip.toggleAttribute('data-dragging', true);
    });
    grip.addEventListener('pointermove', (event) => {
      if (drag?.pointer !== event.pointerId) return;
      resize(side, dragWidth(side, drag.start, event.clientX - drag.x), false);
    });
    const end = (event: PointerEvent): void => {
      if (drag?.pointer !== event.pointerId) return;
      drag = null;
      main.removeAttribute('data-gripping');
      grip.removeAttribute('data-dragging');
      keep();
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('lostpointercapture', end);
    grip.addEventListener('dblclick', () => {
      settings[side].width = null;
      view[side].width = DEFAULT_WIDTH[side];
      keep();
      render();
    });
    grip.addEventListener('keydown', (event) => {
      const wanted = gripKey(event.key, side, widths()[side]);
      if (wanted === null) return;
      event.preventDefault();
      resize(side, wanted, true);
    });
  }

  function mountSide(side: Side): void {
    const { rail, fold, tabs } = parts[side];
    rail?.addEventListener('click', () => {
      if (narrow()) {
        setOverlay(side, true);
        return;
      }
      setFolds([side], false);
      focusTab(side);
    });
    fold?.addEventListener('click', () => {
      if (narrow()) setOverlay(null, true);
      else setFolds([side], true);
    });
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        if (id !== undefined) pick(side, id);
      });
      tab.addEventListener('keydown', (event) => {
        const next = nextTab(tabIds(parts[side]), view[side].tab, event.key);
        if (next === null) return;
        event.preventDefault();
        pick(side, next);
        focusTab(side);
      });
    }
    mountGrip(side);
  }

  for (const side of SIDES) mountSide(side);

  // The mode's defaults apply only where the person set nothing (`foldOnSwitch`, `tabFor`).
  new MutationObserver(() => {
    const next = modeOf(main);
    if (next === mode) return;
    mode = next;
    for (const side of SIDES) {
      view[side].folded = foldOnSwitch(settings[side], side, mode, view[side].folded);
      view[side].tab = tabFor(side, mode, picked[mode][side], tabIds(parts[side]));
    }
    render();
  }).observe(main, { attributes: true, attributeFilter: ['data-mode'] });

  // A conflict needs an answer: its panel opens, for this page only.
  const conflict = parts.right.aside.querySelector<HTMLElement>('[data-edit="conflict"]');
  if (conflict) {
    new MutationObserver(() => {
      if (conflict.hidden) return;
      if (narrow()) setOverlay('right', false);
      else if (view.right.folded) {
        view.right.folded = false;
        render();
      }
    }).observe(conflict, { attributes: true, attributeFilter: ['hidden'] });
  }

  // A click outside the panel over the canvas closes it; the context menu and dialogs are not
  // outside, as they belong to what the panel shows.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (overlay === null) return;
      const target = event.target;
      if (!(target instanceof Element) || holds(overlay, target)) return;
      if (target.closest('[data-edit="menu"], dialog')) return;
      setOverlay(null, false);
    },
    true,
  );
  // A click into a frame never reaches the page; the focus moving into it does.
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (overlay !== null && document.activeElement instanceof HTMLIFrameElement) {
        setOverlay(null, false);
      }
    }, 0);
  });
  window.addEventListener('resize', render);
  narrowQuery.addEventListener('change', () => {
    overlay = null;
    render();
  });

  render();
  return {
    toggle,
    toggleBoth() {
      if (narrow()) setOverlay(null, true);
      else setFolds(SIDES, foldBoth({ left: view.left.folded, right: view.right.folded }));
    },
    closeOverlay() {
      if (overlay === null) return false;
      setOverlay(null, true);
      return true;
    },
  };
}
