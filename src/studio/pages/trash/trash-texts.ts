// The texts the trash scripts show (ADR 0064): the confirm, the message with Undo, and what a failed
// call says. One JSON block, `#trash-texts`, on every page that deletes or lists deleted drafts;
// `client/studio/trash/texts.ts` reads it. A key is `studio.trash.<name>` in `locales/en.json`.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';

/** The names under `studio.trash.` the script asks for. */
export const TRASH_TEXT_KEYS = [
  'cancel',
  'delete.title',
  'delete.body',
  'delete.confirm',
  'delete.done',
  'delete.failed',
  'delete.locked',
  'undo',
  'undone',
  'restore.failed',
  'restore.exists',
  'forever.title',
  'forever.body',
  'forever.confirm',
  'forever.done',
  'forever.failed',
] as const;

export type TrashTextsInput = { t: Translate; nonce: string };

/** JSON that cannot end its `<script>` element or open a comment in it. */
const scriptJson = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

export function trashTexts(input: TrashTextsInput): Html {
  const { t } = input;
  const texts = Object.fromEntries(TRASH_TEXT_KEYS.map((key) => [key, t(`studio.trash.${key}`)]));
  return html`<script type="application/json" id="trash-texts" nonce="${input.nonce}">${trusted(scriptJson(texts))}</script>`;
}
