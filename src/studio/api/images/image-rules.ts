// What an uploaded image must be (spec 4c, goal 10): its bytes match its type, and its stored name
// is safe and unique. Pure: the route reads the request and `src/edit/adapters/image-files.ts`
// writes the file. Nothing a person typed reaches a path except through `safeImageName`.

import { IMAGE_TYPES, type ImageType } from './image-schemas.ts';

/** Where a stored image goes, and what lists a version's images: the route's port. */
export type ImageStore = {
  /** The file names in a version's `src/img`, sorted. */
  list(slug: string, version: number): readonly string[];
  /** Writes a new file there; throws when it exists, so one upload never replaces another. */
  write(slug: string, version: number, file: string, bytes: Uint8Array): void;
};

const startsWith = (bytes: Uint8Array, head: readonly number[], at = 0): boolean =>
  head.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/** The first bytes of each format; a file is what these say it is, whatever its name or type. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  // `ftyp`, then a brand: `avif` (a still) or `avis` (a sequence).
  if (startsWith(bytes, ascii('ftyp'), 4)) {
    if (startsWith(bytes, ascii('avif'), 8) || startsWith(bytes, ascii('avis'), 8)) {
      return 'image/avif';
    }
  }
  return null;
}

/** Text that opens a tag is an SVG or HTML file, which can carry script: never stored. */
export function looksLikeMarkup(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 256));
  return /^\s*(?:﻿)?\s*</.test(head);
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** The bytes of a base64 text; `null` when it is not base64. */
export function decodeBase64(data: string): Uint8Array | null {
  if (data.length % 4 !== 0 || !BASE64.test(data)) return null;
  return new Uint8Array(Buffer.from(data, 'base64'));
}

/** The most characters of a stored name before its extension. */
const MAX_STEM = 60;

/**
 * A file name made from the person's: lower case, `a-z`, `0-9` and `-` only, the extension of the
 * type, and `-2`, `-3` and on when `taken` (compared without case) already holds the name.
 */
export function safeImageName(name: string, type: ImageType, taken: Iterable<string>): string {
  const extension = IMAGE_TYPES[type];
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_STEM)
    .replace(/-+$/g, '');
  const used = new Set([...taken].map((file) => file.toLowerCase()));
  const root = stem === '' ? 'image' : stem;
  let file = `${root}.${extension}`;
  for (let count = 2; used.has(file); count += 1) file = `${root}-${count}.${extension}`;
  return file;
}
