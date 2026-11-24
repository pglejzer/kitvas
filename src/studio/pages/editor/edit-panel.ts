// The editor's parts that the draft page renders outside the screen's regions (spec 4a; plan 15,
// C4): the texts the page's script shows, and the context menu's empty host. `client/studio/`
// fills them. Only the latest built version, outside compare, can be edited.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';
import { EDIT_TEXT_KEYS } from './edit-texts.ts';

export type EditTextsInput = { t: Translate; nonce: string };

/** JSON that cannot end its `<script>` element or open a comment in it. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

/**
 * The script's texts in one JSON block. Every draft page has it, editable or not: the screen's own
 * parts (the list of shortcuts, the rails) show some of them too.
 */
export function editTexts(input: EditTextsInput): Html {
  const { t } = input;
  const texts = Object.fromEntries(EDIT_TEXT_KEYS.map((key) => [key, t(`studio.edit.${key}`)]));
  return html`<script type="application/json" id="edit-texts" nonce="${input.nonce}">${trusted(scriptJson(texts))}</script>`;
}

/** The context menu's host, placed by the script over everything; only where the editor runs. */
export function editMenu(editable: boolean): Html | '' {
  return editable ? html`<div data-edit="menu" hidden></div>` : '';
}
