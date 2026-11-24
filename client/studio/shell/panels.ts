// The editor screen's side panels on the page (plan 15, task A; plan 18, task A, C8): the rail
// that shows one pane of the left panel at a time and folds it, the right panel's tabs, the grips,
// folding, every `[data-open-pane]` button, and in a narrow window one panel at a time over the
// canvas. The rules are `layout.ts`; here they meet the page. Widths and folds the person sets are
// kept per viewer in `localStorage`, and the screen works the same when storage is missing or
// refuses. A fold that changes the canvas's room is one move (`move.ts`).

import { text } from '../edit/texts.ts';
import {
  CHROME,
  clampSide,
  DEFAULT_WIDTH,
  dragWidth,
  FOLDED,
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
  railClick,
  railPressed,
  readSettings,
  SIDES,
  type Side,
  type StorageLike,
  sideOfPane,
  tabFor,
  writeSettings,
} from './layout.ts';
import { createMover } from './move.ts';
import { mountTabRow, showTab } from './tab-row.ts';

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
  /** What picks a pane: the rail's buttons on the left, the tabs on the right. */
  switches: HTMLElement[];
  /** The left: the rail; the right: the button a folded panel becomes. */
  rail: HTMLElement | null;
  fold: HTMLElement | null;
};

type View = { width: number; folded: boolean; tab: string };

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');
const modeOf = (main: HTMLElement): Mode => (main.dataset.mode === 'edit' ? 'edit' : 'preview');

/** The pane a switch picks: `data-rail-tab` on the rail, `data-tab` on a tab. */
const paneOf = (side: Side, element: HTMLElement): string | undefined =>
  side === 'left' ? element.dataset.railTab : element.dataset.tab;

function storageOf(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function partsOf(main: HTMLElement, side: Side): Parts | null {
  const aside = main.querySelector<HTMLElement>(`aside[data-side="${side}"]`);
  if (!aside) return null;
  const grip = main.querySelector<HTMLElement>(`[data-grip="${side}"]`);
  const fold = main.querySelector<HTMLElement>(`[data-fold="${side}"]`);
  if (side === 'left') {
    const switches = [...main.querySelectorAll<HTMLElement>('button[data-rail-tab]')];
    const rail = switches[0]?.closest<HTMLElement>('nav') ?? null;
    return { aside, grip, fold, rail, switches };
  }
  const rail = aside.querySelector<HTMLElement>('[data-rail="right"]');
  const switches = [...aside.querySelectorAll<HTMLElement>('[role="tab"][data-tab]')];
  return { aside, grip, fold, rail, switches };
}

const NONE: Panels = { toggle() {}, toggleBoth() {}, closeOverlay: () => false };

export function mountPanels(main: HTMLElement): Panels {
  const left = partsOf(main, 'left');
  const right = partsOf(main, 'right');
  if (!left || !right) return NONE;
  const parts: Record<Side, Parts> = { left, right };
  const tabRow = right.switches[0]?.parentElement;
  if (tabRow) mountTabRow(tabRow);
  const paneIds = (side: Side): string[] =>
    parts[side].switches.map((one) => paneOf(side, one) ?? '').filter((id) => id !== '');
  const storage = storageOf();
  const settings = readSettings(storage);
  const mover = createMover(main);
  let mode = modeOf(main);
  /** The pane last picked per mode, for this page only. */
  const picked: Record<Mode, Partial<Record<Side, string>>> = { preview: {}, edit: {} };
  const start = (side: Side): View => ({
    ...openingSide(settings[side], side, mode),
    tab: tabFor(side, mode, undefined, paneIds(side)),
  });
  const view: Record<Side, View> = { left: start('left'), right: start('right') };
  /** The panel open over the canvas in a narrow window. */
  let overlay: Side | null = null;
  /** The folds last drawn in a wide window: a change of one is a move. */
  let drawn: Record<Side, boolean> | null = null;
  const narrowQuery = window.matchMedia(NARROW_QUERY);
  const narrow = (): boolean => narrowQuery.matches;
  const widths = (): Record<Side, number> => fitSides(view, window.innerWidth - CHROME);
  const isOpen = (side: Side): boolean => (narrow() ? overlay === side : !view[side].folded);
  const keep = (): void => {
    writeSettings(storage, settings);
  };

  function renderSwitches(side: Side): void {
    const { aside, switches } = parts[side];
    const current = view[side].tab;
    const shown = { tab: current, open: isOpen(side) };
    for (const one of switches) {
      const pane = paneOf(side, one) ?? '';
      if (side === 'left') {
        one.setAttribute('aria-pressed', String(railPressed(pane, shown)));
      } else {
        one.setAttribute('aria-selected', String(pane === current));
        one.tabIndex = pane === current ? 0 : -1;
      }
    }
    // The tab row scrolls sideways in a narrow panel: the tab picked is brought into view.
    if (side === 'right') {
      const picked = switches.find((one) => paneOf(side, one) === current);
      if (picked) showTab(picked);
    }
    // A pane that comes into view rises in (`.k-rise` on the pane host).
    for (const pane of aside.querySelectorAll<HTMLElement>(':scope > [data-pane]')) {
      pane.hidden = pane.dataset.pane !== current;
    }
    if (side === 'left') parts.left.fold?.setAttribute('aria-expanded', String(shown.open));
  }

  function renderRail(): void {
    const { rail, switches } = parts.right;
    if (!rail) return;
    const name = switches.find((tab) => tab.dataset.tab === view.right.tab)?.textContent ?? '';
    const label = rail.querySelector('.side-rail-name');
    if (label && label.textContent !== name) label.textContent = name;
    rail.setAttribute('aria-label', text('shell.open', { name }));
  }

  function render(): void {
    const shown = widths();
    const isNarrow = narrow();
    const folds = { left: view.left.folded, right: view.right.folded };
    // Only a fold the canvas sees moves; the first paint, a narrow window and a resize do not.
    if (!isNarrow && drawn !== null && SIDES.some((side) => drawn?.[side] !== folds[side])) {
      mover.start();
    }
    drawn = isNarrow ? null : folds;
    for (const side of SIDES) {
      const { aside, grip } = parts[side];
      const { width, folded } = view[side];
      // The variable is the open width: a narrow window's overlay is cut by the skin instead.
      main.style.setProperty(`--side-${side}`, `${isNarrow ? width : shown[side]}px`);
      aside.toggleAttribute('data-folded', folded);
      aside.toggleAttribute('data-overlay', isNarrow && overlay === side);
      if (grip) {
        grip.hidden = folded;
        const rest = view[other(side)].folded ? FOLDED[other(side)] : shown[other(side)];
        const room = window.innerWidth - CHROME;
        grip.setAttribute('aria-valuemin', String(MIN_SIDE));
        grip.setAttribute('aria-valuemax', String(clampSide(MAX_SIDE, room, rest)));
        grip.setAttribute('aria-valuenow', String(shown[side]));
      }
      renderSwitches(side);
    }
    renderRail();
  }

  /** The panel itself; the rail beside the left panel is not in it. */
  const inPanel = (side: Side, node: Element | null): boolean =>
    node !== null && parts[side].aside.contains(node);
  /** The panel and what opens it: a click there is not a click outside its overlay. */
  const inSide = (side: Side, node: Element | null): boolean =>
    inPanel(side, node) || (side === 'left' && node !== null && left.rail?.contains(node) === true);

  /** Where the focus goes when a panel folds or closes: its rail. */
  function focusRail(side: Side): void {
    if (side === 'right') {
      parts.right.rail?.focus();
      return;
    }
    const button = parts.left.switches.find((one) => one.dataset.railTab === view.left.tab);
    (button ?? parts.left.fold)?.focus();
  }

  /** Where the focus goes when a panel opens for a key: its tab, or the left pane shown. */
  function focusInto(side: Side): void {
    if (side === 'right') {
      parts.right.switches.find((tab) => tab.dataset.tab === view.right.tab)?.focus();
      return;
    }
    const panes = [...parts.left.aside.querySelectorAll<HTMLElement>(':scope > [data-pane]')];
    panes.find((pane) => pane.dataset.pane === view.left.tab)?.focus();
  }

  /** Folds or opens panels the person asked for; the focus leaves a panel that folds. */
  function setFolds(sides: readonly Side[], folded: boolean): void {
    const inside = sides.find((side) => inPanel(side, document.activeElement));
    for (const side of sides) {
      view[side].folded = folded;
      settings[side].folded = folded;
    }
    keep();
    render();
    if (folded && inside !== undefined) focusRail(inside);
  }

  function setOverlay(next: Side | null, giveFocus: boolean): void {
    const was = overlay;
    if (next === was) {
      render();
      return;
    }
    overlay = next;
    render();
    if (next !== null && giveFocus) focusInto(next);
    else if (was !== null && giveFocus && inPanel(was, document.activeElement)) focusRail(was);
  }

  function toggle(side: Side): void {
    if (narrow()) setOverlay(overlay === side ? null : side, true);
    else setFolds([side], !view[side].folded);
  }

  function pick(side: Side, pane: string): void {
    picked[mode][side] = pane;
    view[side].tab = pane;
  }

  /** Shows `pane` in its panel, opening the panel (C8: `[data-open-pane]`). */
  function openPane(side: Side, pane: string): void {
    pick(side, pane);
    if (narrow()) setOverlay(side, false);
    else if (view[side].folded) setFolds([side], false);
    else render();
  }

  /** A click on a rail button: its pane in the open panel, or the panel folded (`railClick`). */
  function railTo(pane: string): void {
    const next = railClick(pane, { tab: view.left.tab, open: isOpen('left') });
    pick('left', next.tab);
    if (narrow()) setOverlay(next.open ? 'left' : null, false);
    else if (view.left.folded === next.open) setFolds(['left'], !next.open);
    else render();
  }

  /** A width the person set, by drag or key: clamped beside the other panel, and kept. */
  function resize(side: Side, wanted: number, save: boolean): void {
    const rest = view[other(side)].folded ? FOLDED[other(side)] : widths()[other(side)];
    const width = clampSide(wanted, window.innerWidth - CHROME, rest);
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

  for (const button of left.switches) {
    button.addEventListener('click', () => {
      const pane = button.dataset.railTab;
      if (pane !== undefined) railTo(pane);
    });
  }
  left.fold?.addEventListener('click', () => toggle('left'));

  right.rail?.addEventListener('click', () => {
    if (narrow()) {
      setOverlay('right', true);
      return;
    }
    setFolds(['right'], false);
    focusInto('right');
  });
  right.fold?.addEventListener('click', () => {
    if (narrow()) setOverlay(null, true);
    else setFolds(['right'], true);
  });
  for (const tab of right.switches) {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      if (id === undefined) return;
      pick('right', id);
      render();
    });
    tab.addEventListener('keydown', (event) => {
      const next = nextTab(paneIds('right'), view.right.tab, event.key);
      if (next === null) return;
      event.preventDefault();
      pick('right', next);
      render();
      focusInto('right');
    });
  }
  for (const side of SIDES) mountGrip(side);

  // Any `[data-open-pane]` (the bar's findings and notes): on `main`, so it may be drawn again.
  main.addEventListener('click', (event) => {
    const opener =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-open-pane]')
        : null;
    if (!opener || !main.contains(opener)) return;
    const pane = opener.dataset.openPane;
    const side = sideOfPane(pane, { left: paneIds('left'), right: paneIds('right') });
    if (side !== null && pane !== undefined) openPane(side, pane);
  });

  // The mode's defaults apply only where the person set nothing (`foldOnSwitch`, `tabFor`):
  // Preview and Edit trade places as one move.
  new MutationObserver(() => {
    const next = modeOf(main);
    if (next === mode) return;
    mode = next;
    for (const side of SIDES) {
      view[side].folded = foldOnSwitch(settings[side], side, mode, view[side].folded);
      view[side].tab = tabFor(side, mode, picked[mode][side], paneIds(side));
    }
    render();
  }).observe(main, { attributes: true, attributeFilter: ['data-mode'] });

  // A conflict needs an answer: its panel opens, for this page only.
  const conflict = right.aside.querySelector<HTMLElement>('[data-edit="conflict"]');
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

  // A click outside the panel over the canvas closes it; the context menu, dialogs and what opens
  // a pane are not outside, as they belong to what the panel shows.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (overlay === null) return;
      const target = event.target;
      if (!(target instanceof Element) || inSide(overlay, target)) return;
      if (target.closest('[data-edit="menu"], dialog, [data-open-pane]')) return;
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
