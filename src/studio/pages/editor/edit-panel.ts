// The editor's parts that the draft page renders outside the screen's regions (spec 4a; plan 15,
// C4): the texts the page's script shows, and the context menu's empty host. `client/studio/`
// fills them. Only the latest built version, outside compare, can be edited.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';
import { EDIT_TEXT_KEYS } from './edit-texts.ts';

/**
 * `kit`: the name of the draft's kit, which the texts that say `{kit}` name. `source`: where the
 * kit comes from (`sourceNoun`), which the texts that say `{source}` name.
 */
export type EditTextsInput = { t: Translate; nonce: string; kit: string; source: string };

/** JSON that cannot end its `<script>` element or open a comment in it. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

/**
 * The script's texts in one JSON block. Every draft page has it, editable or not: the screen's own
 * parts (the list of shortcuts, the rails) show some of them too. A draft has one kit, so its
 * name is filled in here ("Base component"); every other `{name}` is left for the script.
 */
export function editTexts(input: EditTextsInput): Html {
  const { t, kit, source } = input;
  const texts = Object.fromEntries(
    EDIT_TEXT_KEYS.map((key) => [key, t(`studio.edit.${key}`, { kit, source })]),
  );
  return html`<script type="application/json" id="edit-texts" nonce="${input.nonce}">${trusted(scriptJson(texts))}</script>`;
}

/** The context menu's host, placed by the script over everything; only where the editor runs. */
export function editMenu(editable: boolean): Html | '' {
  return editable ? html`<div data-edit="menu" hidden></div>` : '';
}
