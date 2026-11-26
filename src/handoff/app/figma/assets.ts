// Use case: the images a Figma package carries. Each image the tree names is copied into `assets/`
// under a name made from its content, so no source path reaches the package. An image outside the
// draft, over the size cap, of a type `upload_assets` does not take, or not found is left out and
// listed (by a label that holds no path).

import { createHash } from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HandoffFiles, PackageFile } from '../../ports/handoff-files.ts';

/** `upload_assets` takes 10 MB a file. */
export const ASSET_MAX_BYTES = 10 * 1024 * 1024;

const TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const DATA_IMAGE = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]*)$/;

export type LeftOut = {
  /** A name that is safe to show: a file's own name, a host, or `data URI`. */
  what: string;
  reason: 'outside' | 'missing' | 'size' | 'type' | 'svg-large';
};

export type AssetPlan = {
  /** The address as the page asked for it, to the file in `assets/`. */
  names: ReadonlyMap<string, string>;
  files: PackageFile[];
  leftOut: LeftOut[];
};

/** The content type of a package asset by its file name; `image/png` for a name it does not know. */
export const assetContentType = (file: string): string =>
  TYPES[extname(file).slice(1).toLowerCase()] ?? 'image/png';

function labelOf(src: string): string {
  if (src.startsWith('data:')) return 'data URI';
  if (/^https?:\/\//i.test(src)) {
    try {
      return new URL(src).host;
    } catch {
      return 'address';
    }
  }
  const clean = src.split(/[?#]/)[0] ?? src;
  return basename(clean.replace(/\\/g, '/')) || 'image';
}

/** The local file an address names, or `undefined` for one that is not a file of this machine. */
function localPath(src: string, pageDir: string): string | undefined {
  if (/^https?:\/\//i.test(src) || src.startsWith('//')) return undefined;
  if (/^file:/i.test(src)) {
    try {
      return fileURLToPath(src.split(/[?#]/)[0] ?? src);
    } catch {
      return undefined;
    }
  }
  const clean = src.split(/[?#]/)[0] ?? src;
  try {
    return resolve(pageDir, decodeURIComponent(clean));
  } catch {
    return resolve(pageDir, clean);
  }
}

const nameOf = (bytes: Uint8Array, extension: string): string =>
  `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${extension}`;

/**
 * `root`: the draft's folder; a file outside it is `outside`. `pageDir`: the folder of the built page,
 * which relative addresses are read from.
 */
export function collectAssets(
  deps: { files: HandoffFiles },
  input: { root: string; pageDir: string; srcs: readonly string[] },
): AssetPlan {
  const names = new Map<string, string>();
  const files = new Map<string, PackageFile>();
  const leftOut: LeftOut[] = [];
  const out = (src: string, reason: LeftOut['reason']): void => {
    leftOut.push({ what: labelOf(src), reason });
  };
  const keep = (src: string, bytes: Uint8Array, extension: string): void => {
    if (bytes.length > ASSET_MAX_BYTES) {
      out(src, 'size');
      return;
    }
    const name = nameOf(bytes, extension);
    names.set(src, name);
    files.set(name, { path: `assets/${name}`, content: bytes });
  };
  for (const src of [...new Set(input.srcs)]) {
    const data = DATA_IMAGE.exec(src);
    if (data?.[1] !== undefined) {
      const extension = EXTENSIONS[data[1]];
      if (extension === undefined) {
        out(src, 'type');
        continue;
      }
      keep(src, Buffer.from(data[2] ?? '', 'base64'), extension);
      continue;
    }
    if (src.startsWith('data:')) {
      out(src, 'type');
      continue;
    }
    const wanted = localPath(src, input.pageDir);
    if (wanted === undefined) {
      out(src, 'outside');
      continue;
    }
    const extension = extname(wanted).slice(1).toLowerCase();
    if (TYPES[extension] === undefined) {
      out(src, 'type');
      continue;
    }
    const real = deps.files.resolveInside(input.root, wanted);
    if (real === undefined) {
      out(src, deps.files.size(wanted) === undefined ? 'missing' : 'outside');
      continue;
    }
    if ((deps.files.size(real) ?? 0) > ASSET_MAX_BYTES) {
      out(src, 'size');
      continue;
    }
    const bytes = deps.files.readBytes(real);
    if (bytes === undefined) {
      out(src, 'missing');
      continue;
    }
    keep(src, bytes, extension === 'jpeg' ? 'jpg' : extension);
  }
  return { names, files: [...files.values()], leftOut };
}
