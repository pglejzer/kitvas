// Entry of the draft page's script, served as `/assets/draft.js`. The page works without it.

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
  // The screen first: the canvas and the editor mount into its regions.
  mountShell(main);
  startDraftPage(main);
  // An older version, a comparison and a draft not built have no editor, and a filter all the same.
  mountChecksFilter(main);
  // "Full check ran 3 minutes ago", kept current on every version.
  mountRan(main);
}
