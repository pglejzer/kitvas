// The shared rules of the studio's skin, in the order they apply: the page, the controls, the
// surfaces, the logo, motion, and the View popover with the font. Page and panel rules come after them
// (`../skin.ts`), each in the file of its own area.

import { SKIN_BASE } from './base.ts';
import { SKIN_CONTROLS } from './controls.ts';
import { SKIN_LOGO } from './logo.ts';
import { SKIN_MOTION } from './motion.ts';
import { SKIN_SURFACES } from './surfaces.ts';
import { SKIN_VIEW } from './view.ts';

export const SHARED_RULES = [
  SKIN_BASE,
  SKIN_CONTROLS,
  SKIN_SURFACES,
  SKIN_LOGO,
  SKIN_MOTION,
  SKIN_VIEW,
].join('');
