// The skin of the studio's other pages, one file per page.

import { SKIN_GALLERY } from './gallery.ts';
import { SKIN_INFO } from './info.ts';
import { SKIN_KIT } from './kit.ts';
import { SKIN_START } from './start.ts';
import { SKIN_STATES } from './states.ts';
import { SKIN_TRASH } from './trash.ts';

/** Each area's rules under its file's name; the tests check every one. */
export const PAGE_PARTS = {
  gallery: SKIN_GALLERY,
  info: SKIN_INFO,
  kit: SKIN_KIT,
  start: SKIN_START,
  states: SKIN_STATES,
  trash: SKIN_TRASH,
};

export const PAGE_RULES = Object.values(PAGE_PARTS).join('');
