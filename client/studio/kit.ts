// Entry of the kit pages' script, served as `/assets/kit.js`. The pages work without it.

import { startKitPage } from './kit/page.ts';
import { mountBarStatus } from './shell/bar-status.ts';
import { mountCopyButtons } from './ui/copy.ts';
import { mountFrameTones } from './ui/frame-tones.ts';
import { mountViewSettings } from './ui/view-settings.ts';

mountViewSettings();
mountCopyButtons();
mountFrameTones();
mountBarStatus();
const main = document.querySelector('main[data-kit]');
if (main instanceof HTMLElement) startKitPage(main);
