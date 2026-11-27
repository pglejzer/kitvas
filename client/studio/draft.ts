// Entry of the draft page's script, served as `/assets/draft.js`. The page works without it.

import { createOpening, showScreen } from './draft/opening.ts';
import { startDraftPage } from './draft/page.ts';
import { mountRan } from './edit/checks/run.ts';
import { mountChecksFilter } from './edit/live/filter.ts';
import { mountBarStatus } from './shell/bar-status.ts';
import { mountShell } from './shell/shell.ts';
import { mountTrash } from './trash/mount.ts';
import { mountCopyButtons } from './ui/copy.ts';
import { mountFrameTones } from './ui/frame-tones.ts';
import { mountViewSettings } from './ui/view-settings.ts';

mountViewSettings();
mountCopyButtons();
mountFrameTones();
mountTrash();
// Claude's status in the editor bar, on every version; the Claude tab paints it too when it reads.
mountBarStatus();
const main = document.querySelector('main.draft-page');
if (main instanceof HTMLElement) {
  // The page came unseen: it shows once, when what it waits for is there (`draft/opening.ts`).
  const opening = createOpening(() => showScreen(main));
  // The screen first: the canvas and the editor mount into its regions.
  mountShell(main);
  startDraftPage(main, opening);
  // An older version, a comparison and a draft not built have no editor, and a filter all the same.
  mountChecksFilter(main);
  // "Full check ran 3 minutes ago", kept current on every version.
  mountRan(main);
  opening.start();
}
