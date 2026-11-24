// The files of a draft version's `src/img` folder: listed for the background image picker (plan 15,
// task C) and written by the image upload (spec 4c, goal 10; plan 16, task E). The draft store
// cannot list a folder or write bytes, so these read and write the disk; `src/main.ts` hands them
// to the studio. A missing folder or a read error lists nothing.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { type DraftStore, versionFolder } from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
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

/** What the upload route stores through (`src/studio/api/images/image-rules.ts` names the same shape). */
export type ImageStoreFiles = {
  list(slug: string, version: number): readonly string[];
  write(slug: string, version: number, file: string, bytes: Uint8Array): void;
};

/** A stored name: lower case, digits and hyphens, one of the five extensions, no folders. */
const STORED_NAME = /^[a-z0-9][a-z0-9-]{0,99}\.(?:png|jpg|webp|avif|gif)$/;

export function createImageStore(drafts: DraftStore): ImageStoreFiles {
  const list = createImageFiles(drafts);
  return {
    list: (slug, version) => list(slug, version),
    write(slug, version, file, bytes) {
      // The name is checked here again: nothing but a plain file name may reach a path.
      if (!STORED_NAME.test(file)) throw new KitvasError('USAGE', { detail: file });
      const root = join(drafts.dir(slug), versionFolder(version));
      if (!existsSync(root)) throw new KitvasError('VERSION_NOT_FOUND', { slug, version });
      const folder = resolve(root, 'src', 'img');
      const target = resolve(folder, file);
      if (!target.startsWith(`${folder}${sep}`)) throw new KitvasError('USAGE', { detail: file });
      mkdirSync(folder, { recursive: true });
      // `wx`: never over a file that is there (a second upload of the same name).
      writeFileSync(target, bytes, { flag: 'wx' });
    },
  };
}
