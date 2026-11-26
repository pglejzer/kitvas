// The trash scripts' texts, handed over by the page in `#trash-texts`
// (`src/studio/pages/trash/trash-texts.ts`). A key the page did not send shows as the key itself,
// so a missing text is easy to see.

import { textsOf } from '../shell/texts-of.ts';

/** `text('delete.done', { title })`: the short key under `studio.trash.`, with `{name}` filled. */
export const text = textsOf('trash-texts');
