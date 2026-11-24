import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDITOR_RULES } from '../../../src/studio/pages/skin/editor/index.ts';
import { SHARED_RULES } from '../../../src/studio/pages/skin/index.ts';
import { PAGE_RULES } from '../../../src/studio/pages/skin/pages/index.ts';
import { studioSkin } from '../../../src/studio/pages/skin.ts';
import { themeCss, themeNames } from '../../../src/studio/theme/theme-css.ts';

// What each part may hold is checked beside it: the theme in test/studio/theme/, the shared rules
// and every area in test/studio/pages/skin/. Here: the sheet as a whole.

test("the sheet is the studio's tokens, then the shared rules, the pages' and the editor's", () => {
  assert.equal(studioSkin(), `${themeCss()}${SHARED_RULES}${PAGE_RULES}${EDITOR_RULES}`);
});

test('the studio has a look of its own: no kit token, and every token it reads is defined', () => {
  const css = studioSkin();
  // A kit styles prototypes; the studio looks the same whichever kit a draft uses (ADR 0057).
  assert.ok(!css.includes('--kit-'));
  // The theme builds its tokens from values of its own; the rules read only the tokens.
  const names = themeNames();
  const rules = `${SHARED_RULES}${PAGE_RULES}${EDITOR_RULES}`;
  const used = [...rules.matchAll(/var\((--st-[a-z0-9-]+)/g)].map((match) => match[1] ?? '');
  assert.ok(used.length > 200);
  for (const name of used) assert.ok(names.has(name), `${name} is defined`);
});

test('the rules of the look before the redesign are gone', () => {
  const css = studioSkin();
  const old = ['.editor-side', '.editor-pane', '.editor-bar', '.edit-toggle', '.draft {', '.opt {'];
  for (const rule of old) assert.ok(!css.includes(rule), rule);
});
