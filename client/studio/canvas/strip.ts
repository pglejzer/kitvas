// The zoom strip in the dock (`div[data-dock="zoom"]`; plan 15, task B): −, a typed percent, +,
// and a menu with Fit, Selection, 50 %, 100 % and 200 %. It only asks; `canvas.ts` zooms.

import { text } from '../edit/texts.ts';
import { MAX_ZOOM, MIN_ZOOM, parsePercent, percentOf } from './zoom.ts';

export type StripActions = {
  step(direction: 1 | -1): void;
  set(zoom: number): void;
  fit(): void;
  selection(): void;
  /** Whether "Selection" has something to zoom to. */
  hasSelection(): boolean;
};

export type Strip = {
  /** Shows the zoom; `fitted` while the canvas is in Fit. */
  show(zoom: number, fitted: boolean): void;
};

/** The zooms the menu offers besides Fit and Selection. */
const MENU_ZOOMS = [0.5, 1, 2] as const;

/** Key names, not sentences: the same on every keyboard but for the command key. */
function commandKey(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform;
  return /mac|iphone|ipad/i.test(platform) ? 'Cmd' : 'Ctrl';
}

function button(label: string, shown: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = shown;
  node.setAttribute('aria-label', label);
  node.addEventListener('click', onClick);
  return node;
}

function menuItem(label: string, keys: string | null, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'zoom-menu-item';
  const name = document.createElement('span');
  name.textContent = label;
  node.append(name);
  if (keys !== null) {
    const hint = document.createElement('kbd');
    hint.textContent = keys;
    node.append(hint);
  }
  node.addEventListener('click', onClick);
  return node;
}

export function mountStrip(host: HTMLElement | null, actions: StripActions): Strip {
  if (!host) return { show() {} };
  let shown = 1;

  const out = button(text('zoom.out'), '−', () => actions.step(-1));
  const more = button(text('zoom.in'), '+', () => actions.step(1));

  const level = document.createElement('input');
  level.type = 'text';
  level.className = 'zoom-level';
  level.inputMode = 'decimal';
  level.autocomplete = 'off';
  level.spellcheck = false;
  level.setAttribute('aria-label', text('zoom.level'));
  level.value = percentOf(shown);
  const commit = (): void => {
    const typed = parsePercent(level.value);
    // Nothing a zoom can be made of: the field shows the zoom again.
    level.value = percentOf(typed ?? shown);
    if (typed !== null) actions.set(typed);
  };
  level.addEventListener('change', commit);
  level.addEventListener('focus', () => level.select());
  level.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      level.value = percentOf(shown);
      level.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      actions.step(event.key === 'ArrowUp' ? 1 : -1);
      // `show` leaves a focused field alone; this step is the field's own.
      level.value = percentOf(shown);
    }
  });

  const menu = document.createElement('details');
  menu.className = 'zoom-menu';
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', text('zoom.menu'));
  const list = document.createElement('div');
  list.className = 'zoom-menu-list';
  const choose = (run: () => void) => (): void => {
    menu.open = false;
    summary.focus();
    run();
  };
  const fit = menuItem(text('zoom.fit'), 'Shift+1', choose(actions.fit));
  const selection = menuItem(text('zoom.selection'), 'Shift+2', choose(actions.selection));
  const fixed = MENU_ZOOMS.map((zoom) =>
    menuItem(
      percentOf(zoom),
      zoom === 1 ? `${commandKey()}+0` : null,
      choose(() => actions.set(zoom)),
    ),
  );
  list.append(fit, selection, ...fixed);
  menu.append(summary, list);
  menu.addEventListener('toggle', () => {
    if (menu.open) selection.disabled = !actions.hasSelection();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.open) return;
    event.stopPropagation();
    menu.open = false;
    summary.focus();
  });
  // A click anywhere else closes the menu, as a menu does.
  document.addEventListener('pointerdown', (event) => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  });

  host.replaceChildren(out, level, more, menu);

  return {
    show(zoom, fitted) {
      shown = zoom;
      // A half-typed value stays while the person is in the field.
      if (document.activeElement !== level) level.value = percentOf(zoom);
      out.disabled = zoom <= MIN_ZOOM;
      more.disabled = zoom >= MAX_ZOOM;
      host.toggleAttribute('data-fit', fitted);
      fit.setAttribute('aria-pressed', String(fitted));
    },
  };
}
