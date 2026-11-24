// Entry of the draft page's script, served as `/assets/draft.js`. The page works without it.

import { startDraftPage } from './draft-page.ts';
import { mountShell } from './shell/shell.ts';

const main = document.querySelector('main.draft-page');
if (main instanceof HTMLElement) {
  // The screen first: the canvas and the editor mount into its regions.
  mountShell(main);
  startDraftPage(main);
}
