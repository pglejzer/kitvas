// The draft's images in the Insert tab (pure, no DOM): the order they are listed in, where a
// thumbnail is loaded from, and what a click on one writes.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { Format } from '../style/ops.ts';
import { imageDropOps } from './image-drop.ts';

/** By name, as the server lists them (lower case, so a plain code-unit sort is the order). */
export function orderImages(files: readonly string[]): string[] {
  return [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const BUILT_PAGE = /^(.*\/)html\/index\.html$/;

/**
 * Where a thumbnail loads from: the lead frame's address with `html/index.html` replaced by
 * `img/<file>`, on the prototype origin that serves a version's built `img` folder. `null` when the
 * address is not a built page of a draft, so the file is listed by name only.
 */
export function thumbnailUrl(frameAddress: string, file: string): string | null {
  try {
    const url = new URL(frameAddress);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const built = BUILT_PAGE.exec(url.pathname);
    if (!built?.[1]) return null;
    return `${url.origin}${built[1]}img/${encodeURIComponent(file)}`;
  } catch {
    return null;
  }
}

export type PickResult =
  | { kind: 'ops'; ops: EditOp[]; label: { key: string; params: Record<string, string> } }
  /** `key`: the text that says why nothing is written. */
  | { kind: 'refused'; key: string };

/**
 * What a click on a listed image writes on the selected element, the same ops as a drop on the
 * canvas. `null`: nothing is selected, so nothing is written.
 */
export function pickOps(inspected: Inspect | null, file: string, format: Format): PickResult {
  if (inspected === null) return { kind: 'refused', key: 'images.selectFirst' };
  return imageDropOps(inspected, file, format);
}
