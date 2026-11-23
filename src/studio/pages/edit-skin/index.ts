// The editor's part of the studio skin, one file per panel so the panels never share a file.

import { EDIT_SKIN_ASK } from './ask.ts';
import { EDIT_SKIN_CHANGES } from './changes.ts';
import { EDIT_SKIN_HISTORY } from './history.ts';
import { EDIT_SKIN_LAYOUT } from './layout.ts';
import { EDIT_SKIN_PROPS } from './props.ts';

export const EDIT_SKIN_RULES = [
  EDIT_SKIN_LAYOUT,
  EDIT_SKIN_PROPS,
  EDIT_SKIN_HISTORY,
  EDIT_SKIN_CHANGES,
  EDIT_SKIN_ASK,
].join('');
