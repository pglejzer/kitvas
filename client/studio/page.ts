// Entry of the Guide, Shortcuts and Doctor pages' script, served as `/assets/page.js`: the View
// settings, the copy buttons, Claude's status in the bar, and the Mac names of the shortcut keys.
// The pages work without it.

import { mountCopyReport } from './info/copy-report.ts';
import { mountModKeys } from './info/mac-keys.ts';
import { mountBarStatus } from './shell/bar-status.ts';
import { mountCopyButtons } from './ui/copy.ts';
import { mountViewSettings } from './ui/view-settings.ts';

mountViewSettings();
mountCopyButtons();
mountCopyReport();
mountBarStatus();
mountModKeys();
