// The sizes behind `kitvas handoff compare`: a page of the person's can be far taller than the
// draft's shot, and the look score decodes no image of more than PIXELS_MAX pixels. Both images are
// scaled by one factor, so their proportions stay as they were and the `size` part of the score still
// says that one is taller. Pure; the browser reads the sizes from the PNG headers and cuts the images.

/** A page taller than this is shot only down to this height: Chromium cuts a screenshot near 16,384 px. */
export const MATCH_HEIGHT_MAX = 16_000;

/** The smallest factor `matchScale` answers with. */
const SCALE_MIN = 0.0001;
/** Factors are floored to this many steps per unit, so the answer reads the same everywhere. */
const SCALE_STEPS = 10_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Width and height of a PNG read from its header (bytes 16 to 23, big-endian), without decoding;
 * undefined when the bytes are not a PNG or say a size of 0.
 */
export function pngSize(bytes: Uint8Array): [number, number] | undefined {
  if (bytes.length < 24) return undefined;
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return undefined;
  const at = (offset: number): number =>
    (bytes[offset] ?? 0) * 2 ** 24 +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0);
  const width = at(16);
  const height = at(20);
  return width < 1 || height < 1 ? undefined : [width, height];
}

/** The size an image of `size` has once scaled by `scale`, as the browser rounds it up. */
const scaledArea = ([width, height]: readonly [number, number], scale: number): number =>
  Math.ceil(width * scale) * Math.ceil(height * scale);

/**
 * One factor, 1 or less, that brings every image to at most `maxPixels` pixels (each side rounded
 * up). 1 when none is larger already, or when a size or the limit is not usable.
 */
export function matchScale(sizes: readonly [number, number][], maxPixels: number): number {
  const usable = sizes.filter(([width, height]) => width >= 1 && height >= 1);
  if (usable.length === 0 || !(maxPixels >= 1)) return 1;
  const fits = usable.map(([width, height]) => Math.sqrt(maxPixels / (width * height)));
  const needed = Math.min(...fits);
  if (needed >= 1) return 1;
  let scale = Math.max(SCALE_MIN, Math.floor(needed * SCALE_STEPS) / SCALE_STEPS);
  while (scale > SCALE_MIN && usable.some((size) => scaledArea(size, scale) > maxPixels)) {
    scale = Math.max(SCALE_MIN, Math.floor(scale * SCALE_STEPS - 1) / SCALE_STEPS);
  }
  return scale;
}
