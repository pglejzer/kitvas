// Entry of the draft page's script, served as `/assets/draft.js`. The page works without it.

import { startDraftPage } from './draft-page.ts';

const main = document.querySelector('main.draft-page');
if (main instanceof HTMLElement) startDraftPage(main);
