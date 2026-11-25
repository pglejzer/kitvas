// One tile of the Insert pane (plan 18, task B; redesign plan 18e, task H7b, mock v10): a component
// shows a preview box of itself on the kit's backdrop with its name under it; without an image the
// box shows the name, so the grid stays even. A section or an icon chip is a plain tile (a section
// with its purpose under the name). Drawing only; `palette.ts` wires the click and the drag. Text
// from the kit goes in with `textContent` only.

import type { PreviewState } from './previews.ts';

export type TileOptions = {
  /** What the tile says on hover when it cannot be clicked: why. */
  hint: string | null;
  disabled: boolean;
  /** A part of a root component (it goes inside its root only). */
  part: boolean;
  /** The preview box of a component tile; left out for chips and rows. */
  preview?: PreviewState;
  /** A second muted line under the name (a section's purpose); makes the tile a row. */
  detail?: string | null;
};

/** Fills the preview box for `state`; `name` is what a box without an image says. */
function fillBox(box: HTMLElement, state: PreviewState, name: string): void {
  box.classList.toggle('insert-tv-making', state.kind === 'making');
  if (state.kind === 'image') {
    const picture = document.createElement('img');
    picture.className = 'insert-tv-img';
    picture.alt = '';
    picture.loading = 'lazy';
    picture.src = state.src;
    // A preview that does not load falls back to the name, never a broken-image mark.
    picture.addEventListener('error', () => fillBox(box, { kind: 'none' }, name));
    box.replaceChildren(picture);
    return;
  }
  if (state.kind === 'making') {
    box.replaceChildren();
    return;
  }
  const label = document.createElement('span');
  label.className = 'insert-tv-name';
  label.textContent = name;
  box.replaceChildren(label);
}

/**
 * Puts `state` into a component tile in place: the tile keeps its place, focus and listeners; only
 * the content of its preview box changes.
 */
export function applyPreview(li: HTMLElement, state: PreviewState): void {
  const box = li.querySelector<HTMLElement>('.insert-tv');
  if (!box) return;
  fillBox(box, state, li.querySelector('.insert-name')?.textContent ?? '');
}

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
  // The full name stays readable in the hover text when the line is clipped.
  button.title = options.disabled ? (options.hint ?? label) : label;
  const name = document.createElement('span');
  name.className = 'insert-name';
  name.textContent = label;
  li.append(button);
  if (options.preview !== undefined) {
    const box = document.createElement('span');
    box.className = 'insert-tv';
    button.append(box, name);
    fillBox(box, options.preview, label);
  } else if (options.detail !== undefined && options.detail !== null) {
    button.classList.add('insert-tile-row');
    const detail = document.createElement('span');
    detail.className = 'insert-detail';
    detail.textContent = options.detail;
    button.append(name, detail);
    if (options.hint !== null && !options.disabled) button.title = `${label}: ${options.hint}`;
  } else {
    button.classList.add('insert-tile-chip');
    button.append(name);
  }
  return { li, button };
}
