// One tile of the Insert pane (plan 18, task B): the thing's name, an icon where the kind has one
// and no picture of the component. Drawing only; `palette.ts` wires the click and the drag.

import type { IconName } from '../../../../src/studio/pages/icons/paths.ts';
import { icon } from '../../ui/icon.ts';

export type TileOptions = {
  /** What the tile says on hover: the category, or why it cannot be clicked. */
  hint: string | null;
  disabled: boolean;
  /** A part of a root component (it goes inside its root only). */
  part: boolean;
  icon: IconName | null;
};

/** `<li><button class="insert-tile">…</button></li>`, with the button for the caller to wire. */
export function tileView(
  label: string,
  options: TileOptions,
): { li: HTMLLIElement; button: HTMLButtonElement } {
  const li = document.createElement('li');
  if (options.part) li.classList.add('insert-part');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'insert-tile';
  button.disabled = options.disabled;
  if (options.icon !== null) button.append(icon(options.icon));
  const name = document.createElement('span');
  name.className = 'insert-name k-clip';
  name.textContent = label;
  button.append(name);
  if (options.hint !== null && options.hint !== '') button.title = options.hint;
  li.append(button);
  return { li, button };
}

/** A titled group of tiles; `null` when there are none. */
export function tileGroup(title: string, tiles: readonly HTMLLIElement[]): HTMLElement | null {
  if (tiles.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'insert-group';
  const heading = document.createElement('h3');
  heading.className = 'insert-cat';
  heading.textContent = title;
  const list = document.createElement('ul');
  list.className = 'insert-tiles';
  list.append(...tiles);
  wrap.append(heading, list);
  return wrap;
}
