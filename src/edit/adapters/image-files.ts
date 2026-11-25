// The files of a draft version's `src/img` folder: listed for the background image picker (plan 15,
// task C) and written by the image upload (spec 4c, goal 10; plan 16, task E). The draft store
// cannot list a folder or write bytes, so these read and write the disk; `src/main.ts` hands them
// to the studio. A missing folder or a read error lists nothing.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { type DraftStore, versionFolder } from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import type { ImageFiles } from '../app/inspect.ts';
import { IMAGE_FILE } from '../domain/style/style-values.ts';

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

/** What the image routes go through (`src/studio/api/images/image-rules.ts` names the same shape). */
export type ImageStoreFiles = {
  list(slug: string, version: number): readonly string[];
  write(slug: string, version: number, file: string, bytes: Uint8Array): void;
  read(slug: string, version: number, file: string): Uint8Array | undefined;
  remove(slug: string, version: number, file: string): void;
  sources(slug: string, version: number): readonly string[];
};

/** A stored name: lower case, digits and hyphens, one of the five extensions, no folders. */
const STORED_NAME = /^[a-z0-9][a-z0-9-]{0,99}\.(?:png|jpg|webp|avif|gif)$/;

/** The path of a plain file in a version's `src/img`, or `null` for a name that is anything else. */
function imagePath(drafts: DraftStore, slug: string, version: number, file: string): string | null {
  if (!IMAGE_FILE.test(file)) return null;
  const folder = resolve(drafts.dir(slug), versionFolder(version), 'src', 'img');
  const target = resolve(folder, file);
  return target.startsWith(`${folder}${sep}`) ? target : null;
}

/** The text of every file under `folder`, in subfolders too; nothing when it is not there. */
function textsUnder(folder: string): string[] {
  try {
    return readdirSync(folder, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'));
  } catch {
    return [];
  }
}

export function createImageStore(drafts: DraftStore): ImageStoreFiles {
  const list = createImageFiles(drafts);
  return {
    list: (slug, version) => list(slug, version),
    read(slug, version, file) {
      const target = imagePath(drafts, slug, version, file);
      if (target === null) return undefined;
      try {
        return new Uint8Array(readFileSync(target));
      } catch {
        return undefined;
      }
    },
    remove(slug, version, file) {
      const target = imagePath(drafts, slug, version, file);
      if (target === null) throw new KitvasError('USAGE', { detail: file });
      rmSync(target);
    },
    sources(slug, version) {
      const root = join(drafts.dir(slug), versionFolder(version), 'src');
      return [...textsUnder(join(root, 'tsx')), ...textsUnder(join(root, 'scss'))];
    },
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
