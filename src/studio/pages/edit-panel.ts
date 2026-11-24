// The editor on the draft page (spec 4a, decision 1): an edit mode on the same frame. The page
// renders the empty panel and the texts; `client/studio/edit/` fills it. Only the latest built
// version, outside compare, can be edited.

import type { Translate } from '../../shared/index.ts';
import { EDIT_TEXT_KEYS } from './edit-texts.ts';
import { type Html, html, trusted } from './html.ts';

export type EditPanelInput = {
  t: Translate;
  nonce: string;
  /** The version shown is the latest one, it is built, and the page does not compare. */
  editable: boolean;
};

/** JSON that cannot end its `<script>` element or open a comment in it. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

/** The Edit button, at the top of the page's controls so it is found before the notes. */
export function editToggle(input: Pick<EditPanelInput, 't' | 'editable'>): Html | string {
  if (!input.editable) return '';
  return html`<button type="button" class="edit-toggle" data-edit-toggle aria-pressed="false">${input.t('studio.edit.toggle')}</button>`;
}

/** The panel, right after the stage: under the frame on a narrow page, a column on a wide one. */
export function editPanel(input: EditPanelInput): Html | string {
  if (!input.editable) return '';
  const { t } = input;
  const texts = Object.fromEntries(EDIT_TEXT_KEYS.map((key) => [key, t(`studio.edit.${key}`)]));
  return html`<aside class="edit-panel" data-edit-panel hidden aria-label="${t('studio.edit.label')}"><div class="edit-bar"><span data-edit-session>${t('studio.edit.session.none')}</span><button type="button" data-edit-save disabled>${t('studio.edit.save')}</button></div><div data-edit="zoom"></div><section data-edit="palette"></section><section data-edit="layers"></section><section data-edit="props"></section><section data-edit="changes"></section><div data-edit="conflict" hidden></div><div data-edit="menu" hidden></div><script type="application/json" id="edit-texts" nonce="${input.nonce}">${trusted(scriptJson(texts))}</script></aside>`;
}
