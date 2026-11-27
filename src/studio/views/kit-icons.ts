// What a kit's page shows of its icons: every name the kit lists, and which of them have a picture.
// A picture is one cell of the sheet the editor's Insert pane uses (ADR 0075); where it sits on the
// sheet is a rule of the page's own `<style nonce>` block, like a swatch's colour.

import { SHEET_NAME } from '../../render/index.ts';
import type { Previews } from '../api/edit/structure-schemas.ts';

export type IconRow = { name: string; drawn: boolean };

export type IconsView = {
  rows: IconRow[];
  /** The rules of the style block; empty when no icon is drawn. */
  rules: string;
  /** No picture yet, and a job is making them: the page says so and waits for it. */
  coming: boolean;
};

/** The side of a drawn icon's box, in px: one cell of the sheet (`.kit-glyph` of the skin). */
const GLYPH_PX = 32;
/** An address that can stand inside `url("…")` of the style block: it ends neither the string nor the block. */
const SAFE_SRC = /^[^"\\<>\s]+$/;

/** The names the kit lists as rows, drawn from the sheet of `previews` where it holds them. */
export function iconsView(names: readonly string[], previews: Previews): IconsView {
  const sheet =
    previews.icons !== null && SAFE_SRC.test(previews.icons.src) ? previews.icons : null;
  const rules: string[] = [];
  const drawn = new Set<string>();
  if (sheet !== null) {
    const { columns } = sheet;
    sheet.names.forEach((name, index) => {
      // A name of the sheet stands in a selector; one that cannot keeps its cell and gets no rule.
      if (!SHEET_NAME.test(name) || drawn.has(name)) return;
      drawn.add(name);
      const x = (index % columns) * GLYPH_PX;
      const y = Math.floor(index / columns) * GLYPH_PX;
      rules.push(`.kit-glyph[data-icon="${name}"] { background-position: ${-x}px ${-y}px; }`);
    });
    if (previews.backdrop !== null) {
      rules.unshift(`.kit-glyph-tile { background: ${previews.backdrop}; }`);
    }
    rules.unshift(
      `.kit-glyph { background-image: url("${sheet.src}"); background-size: ${columns * GLYPH_PX}px auto; }`,
    );
  }
  const rows = names.map((name) => ({ name, drawn: drawn.has(name) }));
  const none = rows.every((row) => !row.drawn);
  return {
    rows,
    rules: none ? '' : rules.join('\n'),
    coming: none && rows.length > 0 && previews.state === 'making',
  };
}
