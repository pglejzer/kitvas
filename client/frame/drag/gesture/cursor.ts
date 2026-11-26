// The cursor of a drag (ADR 0066): `grabbing` while the pointer has a place to drop on,
// `not-allowed` while it has none. One style element of the frame's own, as `hide.ts` has: no
// element of the page is changed, and nothing is written anywhere.

export type DragCursor = 'grabbing' | 'not-allowed';

/** The rule that shows `cursor` over the whole page; empty for none. */
export function cursorCss(cursor: DragCursor | null): string {
  return cursor === null ? '' : `html,html *{cursor:${cursor}!important}`;
}

export type Cursor = {
  /** `null` gives the page its own cursors back. */
  set(cursor: DragCursor | null): void;
};

/** The style element is made the first time a cursor is set: a page that never drags has none. */
export function createCursor(): Cursor {
  let style: HTMLStyleElement | undefined;
  let shown: DragCursor | null = null;
  return {
    set(cursor) {
      if (cursor === shown) return;
      shown = cursor;
      if (!style) {
        style = document.createElement('style');
        style.setAttribute('data-kitvas-drag', '');
      }
      // A page that replaced its head took the style element out with it.
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      style.textContent = cursorCss(cursor);
    },
  };
}
