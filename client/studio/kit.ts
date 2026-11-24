// Entry of the kit page's script, served as `/assets/kit.js`. The page works without it.

import { startKitPage } from './kit/page.ts';

const main = document.querySelector('main[data-kit]');
if (main instanceof HTMLElement) startKitPage(main);
