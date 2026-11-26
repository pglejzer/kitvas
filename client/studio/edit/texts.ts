// The editor's texts, handed over by the page in `#edit-texts` (src/studio/pages/editor/edit-panel.ts).
// A key the page did not send shows as the key itself, so a missing text is easy to see.

import { textsOf } from '../shell/texts-of.ts';

/** `text('session.open', { version: 4 })`: the short key under `studio.edit.`, with `{name}` filled. */
export const text = textsOf('edit-texts');
