// The original of a rework, as the page shows it: the only files of a draft the studio reads
// as pictures. Only `before/shots/<width>.png` and `before/images/<name>` of an image type.

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { BEFORE_DIR } from '../../checks/index.ts';
import type { DraftStore } from '../../drafts/index.ts';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const SHOT = new RegExp(`^${BEFORE_DIR}/shots/[0-9]{2,5}\\.png$`);
const IMAGE = new RegExp(`^${BEFORE_DIR}/images/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\\.([A-Za-z0-9]+)$`);

/** A picture is a few MB at most; a larger file is not shown. */
const MAX_BYTES = 4 * 1024 * 1024;

/** The content type for a path the page may show; `undefined` for any other path. */
export function beforeImageType(rel: string): string | undefined {
  if (SHOT.test(rel)) return TYPES.png;
  const extension = IMAGE.exec(rel)?.[1]?.toLowerCase();
  return extension === undefined ? undefined : TYPES[extension];
}

/**
 * The file as a `data:` address (the studio's CSP allows `data:` images), or `undefined` when
 * the path is outside `before/`, not an image type, a link, missing or too large.
 */
export function readBeforeImage(store: DraftStore, slug: string, rel: string): string | undefined {
  const type = beforeImageType(rel);
  if (type === undefined) return undefined;
  const file = join(store.dir(slug), ...rel.split('/'));
  try {
    // lstat: a symbolic link is never followed.
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return undefined;
    const root = realpathSync.native(join(store.dir(slug), BEFORE_DIR));
    if (!realpathSync.native(file).startsWith(`${root}${sep}`)) return undefined;
    return `data:${type};base64,${readFileSync(file).toString('base64')}`;
  } catch {
    // Missing or unreadable: the page says there is no picture.
    return undefined;
  }
}
