// Icons in the pages' markup: the sprite every page carries once, and `icon`, which points to a
// symbol of it. An icon is decoration: the control it sits in carries the name (`aria-label` and
// a `title`), so the icon itself is hidden from assistive technology.

import { type Html, html, trusted } from '../html.ts';
import { ICON_NAMES, ICONS, type IconName, iconId } from './paths.ts';

/** One icon. `.k-icon` gives it its size and stroke (`skin/controls.ts`). */
export function icon(name: IconName): Html {
  return html`<svg class="k-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="#${iconId(name)}"></use></svg>`;
}

/** The symbols of every icon, at the start of `body`; it takes no room and is never read out. */
export function iconSprite(): Html {
  const symbols = ICON_NAMES.map(
    (name) => `<symbol id="${iconId(name)}" viewBox="0 0 16 16">${ICONS[name]}</symbol>`,
  );
  return trusted(
    `<svg class="k-sprite" aria-hidden="true" focusable="false" width="0" height="0">${symbols.join('')}</svg>`,
  );
}
