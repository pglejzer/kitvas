// The icons of the Insert pane: square glyph tiles cut from the sheet image, and text chips for the
// names that are not on the sheet. Drawing only; `previews.ts` decides which is which.

import { listOf } from './group-view.ts';
import { glyphBox, type IconSheet, splitIcons } from './previews.ts';
import { tileView } from './tile.ts';

/** One glyph tile: a button named by the icon, its glyph a `span` showing the sheet at its cell. */
export function glyphTile(
  name: string,
  sheet: IconSheet,
): { li: HTMLLIElement; button: HTMLButtonElement } | null {
  const box = glyphBox(sheet, name);
  if (box === null) return null;
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'insert-glyph-tile';
  button.setAttribute('aria-label', name);
  button.title = name;
  const glyph = document.createElement('span');
  glyph.className = 'insert-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.style.setProperty('--glyph-img', `url(${JSON.stringify(sheet.src)})`);
  glyph.style.setProperty('--glyph-x', `${box.x}px`);
  glyph.style.setProperty('--glyph-y', `${box.y}px`);
  glyph.style.setProperty('--glyph-w', `${box.width}px`);
  button.append(glyph);
  li.append(button);
  return { li, button };
}

export type IconWire = (name: string, button: HTMLButtonElement) => void;

/**
 * The body of the icons group: glyph tiles first, then the chips of the names off the sheet (or all
 * of them when there is no sheet). `wire` attaches the click and the drag to each button.
 */
export function iconBody(
  names: readonly string[],
  sheet: IconSheet | null,
  wire: IconWire,
): HTMLElement {
  const body = document.createElement('div');
  const { glyphs, chips } = splitIcons(names, sheet);
  if (sheet !== null && glyphs.length > 0) {
    const tiles: HTMLLIElement[] = [];
    for (const name of glyphs) {
      const made = glyphTile(name, sheet);
      if (!made) continue;
      wire(name, made.button);
      tiles.push(made.li);
    }
    body.append(listOf('insert-glyphs', tiles));
  }
  if (chips.length > 0) {
    const items = chips.map((name) => {
      const { li, button } = tileView(name, { hint: null, disabled: false, part: false });
      wire(name, button);
      return li;
    });
    body.append(listOf('insert-tiles insert-chips', items));
  }
  return body;
}
