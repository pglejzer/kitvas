// The files of a draft version's `src/img` folder, for the background image picker (plan 15,
// task C). The draft store cannot list a folder, so this one reads the disk; `src/main.ts` hands
// it to the studio's inspect route. A missing folder or a read error lists nothing.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type DraftStore, versionFolder } from '../../drafts/index.ts';
import type { ImageFiles } from '../app/inspect.ts';

export function createImageFiles(drafts: DraftStore): ImageFiles {
  return (slug, version) => {
    try {
      const folder = join(drafts.dir(slug), versionFolder(version), 'src', 'img');
      return readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  };
}
