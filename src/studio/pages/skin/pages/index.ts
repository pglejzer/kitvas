// The skin of the studio's other pages, one file per page.

import { SKIN_GALLERY } from './gallery.ts';
import { SKIN_KIT } from './kit.ts';
import { SKIN_STATES } from './states.ts';

/** Each area's rules under its file's name; the tests check every one. */
export const PAGE_PARTS = {
  gallery: SKIN_GALLERY,
  kit: SKIN_KIT,
  states: SKIN_STATES,
};

export const PAGE_RULES = Object.values(PAGE_PARTS).join('');
