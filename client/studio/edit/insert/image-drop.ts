// What a dropped image does to the element it lands on (spec 4c, goal 10): an `img`, or a kit
// component with a `src` prop, gets its `src`; any other element gets its background image. Both
// are ordinary edits, so they have undo. Pure: no DOM; the canvas drop (`file-drop.ts`) calls it.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { imageUrl, plainValue } from '../props/kinds.ts';
import { type Format, opsForProp, opsForStyle } from '../style/ops.ts';

/** The prop an image file goes into. */
export const SRC_PROP = 'src';

/** Prototypes name their images relative to the page, as `../img/<file>` (`src/render/AGENTS.md`). */
export const srcOf = (file: string): string => `../img/${file}`;

/** An element that shows an image by itself: `img`, or a kit component with a `src` prop. */
export function takesSrc(inspected: Pick<Inspect, 'tag' | 'component'>): boolean {
  if (inspected.tag === 'img') return true;
  return inspected.component?.props.some((prop) => prop.name === SRC_PROP) === true;
}

export type ImageDrop =
  | { kind: 'ops'; ops: EditOp[]; label: { key: string; params: Record<string, string> } }
  /** `key`: the text that says why nothing was written. */
  | { kind: 'refused'; key: string };

/**
 * The edit a dropped, stored image makes on `inspected`. `inspected` must have been read after the
 * upload, so the file is among its `images`. A refusal is a text key: an expression `src`, a
 * background the class rule cannot take, an element that is not in a file the editor can write.
 */
export function imageDropOps(inspected: Inspect, file: string, format: Format): ImageDrop {
  if (takesSrc(inspected)) {
    const ops = opsForProp(inspected, SRC_PROP, { kind: 'string', value: srcOf(file) });
    return ops.length > 0
      ? { kind: 'ops', ops, label: { key: 'upload.drop.src', params: { file } } }
      : { kind: 'refused', key: 'upload.drop.srcFixed' };
  }
  const ops = opsForStyle(inspected, 'background-image', plainValue(imageUrl(file)), { format });
  return ops.length > 0
    ? { kind: 'ops', ops, label: { key: 'upload.drop.background', params: { file } } }
    : { kind: 'refused', key: 'upload.drop.backgroundFixed' };
}

/** What a drag carries when it holds files, as `DataTransfer.types` lists it. */
export const carriesFiles = (types: readonly string[]): boolean => types.includes('Files');
