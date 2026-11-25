// The editor screen's part of the skin, one file per area so no two areas share a file.

import { SKIN_EDITOR_ASK } from './ask.ts';
import { SKIN_EDITOR_BAR } from './bar.ts';
import { SKIN_EDITOR_BODY } from './body.ts';
import { SKIN_EDITOR_CHANGES } from './changes.ts';
import { SKIN_EDITOR_CHECKS } from './checks.ts';
import { SKIN_EDITOR_CLAUDE } from './claude.ts';
import { SKIN_EDITOR_COMPARE } from './compare.ts';
import { SKIN_EDITOR_INSERT } from './insert.ts';
import { SKIN_EDITOR_LAYERS } from './layers.ts';
import { SKIN_EDITOR_LENS } from './lens.ts';
import { SKIN_EDITOR_NOTES } from './notes.ts';
import { SKIN_EDITOR_OVERLAYS } from './overlays.ts';
import { SKIN_EDITOR_PROPS } from './props.ts';
import { SKIN_EDITOR_PROPS_CONTROLS } from './props-controls.ts';
import { SKIN_EDITOR_SELTOOLS } from './seltools.ts';
import { SKIN_EDITOR_SKETCHES } from './sketches.ts';
import { SKIN_EDITOR_STAGE } from './stage.ts';
import { SKIN_EDITOR_VERSIONS } from './versions.ts';
import { SKIN_EDITOR_WHY } from './why.ts';

/** Each area's rules under its file's name; the tests check every one. */
export const EDITOR_PARTS = {
  bar: SKIN_EDITOR_BAR,
  body: SKIN_EDITOR_BODY,
  stage: SKIN_EDITOR_STAGE,
  lens: SKIN_EDITOR_LENS,
  ask: SKIN_EDITOR_ASK,
  seltools: SKIN_EDITOR_SELTOOLS,
  compare: SKIN_EDITOR_COMPARE,
  layers: SKIN_EDITOR_LAYERS,
  versions: SKIN_EDITOR_VERSIONS,
  insert: SKIN_EDITOR_INSERT,
  why: SKIN_EDITOR_WHY,
  notes: SKIN_EDITOR_NOTES,
  props: SKIN_EDITOR_PROPS,
  'props-controls': SKIN_EDITOR_PROPS_CONTROLS,
  changes: SKIN_EDITOR_CHANGES,
  checks: SKIN_EDITOR_CHECKS,
  claude: SKIN_EDITOR_CLAUDE,
  sketches: SKIN_EDITOR_SKETCHES,
  overlays: SKIN_EDITOR_OVERLAYS,
};

export const EDITOR_RULES = Object.values(EDITOR_PARTS).join('');
