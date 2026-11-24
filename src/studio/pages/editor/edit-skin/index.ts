// The editor's part of the studio skin, one file per panel so the panels never share a file.

import { EDIT_SKIN_ASK } from './ask.ts';
import { EDIT_SKIN_CANVAS } from './canvas.ts';
import { EDIT_SKIN_CHANGES } from './changes.ts';
import { EDIT_SKIN_CONTEXT } from './context.ts';
import { EDIT_SKIN_HISTORY } from './history.ts';
import { EDIT_SKIN_LAYERS } from './layers.ts';
import { EDIT_SKIN_LAYOUT } from './layout.ts';
import { EDIT_SKIN_LIVE } from './live.ts';
import { EDIT_SKIN_MENU } from './menu.ts';
import { EDIT_SKIN_PALETTE } from './palette.ts';
import { EDIT_SKIN_PROPS } from './props.ts';
import { EDIT_SKIN_SCREEN } from './screen.ts';
import { EDIT_SKIN_UPLOAD } from './upload.ts';
import { EDIT_SKIN_ZOOM } from './zoom.ts';

export const EDIT_SKIN_RULES = [
  EDIT_SKIN_LAYOUT,
  EDIT_SKIN_PROPS,
  EDIT_SKIN_HISTORY,
  EDIT_SKIN_CHANGES,
  EDIT_SKIN_ASK,
  EDIT_SKIN_LAYERS,
  EDIT_SKIN_PALETTE,
  EDIT_SKIN_MENU,
  EDIT_SKIN_ZOOM,
  // The editor screen (plan 15) last, so it overrides the older page rules.
  EDIT_SKIN_SCREEN,
  EDIT_SKIN_CANVAS,
  // Stage 4c (plan 16).
  EDIT_SKIN_CONTEXT,
  EDIT_SKIN_LIVE,
  EDIT_SKIN_UPLOAD,
].join('');
