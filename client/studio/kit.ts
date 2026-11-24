// Entry of the kit page's script, served as `/assets/kit.js`. The page works without it.

import { startKitPage } from './kit/page.ts';
import { mountCopyButtons } from './ui/copy.ts';
import { mountFrameTones } from './ui/frame-tones.ts';
import { mountViewSettings } from './ui/view-settings.ts';

mountViewSettings();
mountCopyButtons();
mountFrameTones();
const main = document.querySelector('main[data-kit]');
if (main instanceof HTMLElement) startKitPage(main);
