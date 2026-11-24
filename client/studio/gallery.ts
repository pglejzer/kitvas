// Entry of the gallery's script, served as `/assets/gallery.js`: the page loads itself again once
// any build or check has ended, so thumbnails and statuses stay current. It works without it.

import { reloadWhenJobsEnd } from './live/live.ts';
import { mountTrash } from './trash/mount.ts';
import { mountCopyButtons } from './ui/copy.ts';
import { mountViewSettings } from './ui/view-settings.ts';

mountViewSettings();
mountCopyButtons();
// The page of a draft that is in the trash loads this script too: Restore is worked here.
mountTrash();
reloadWhenJobsEnd(() => true);
