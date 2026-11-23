// Small generated images for the look score tests.

import type { Pixels } from '../../src/checks/index.ts';

export type Rgb = [number, number, number];

/** One colour all over. */
export function solid(width: number, height: number, [r, g, b]: Rgb): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set([r, g, b, 255], index * 4);
  }
  return { width, height, data };
}

/** A white image with a dark bar over rows `top` to `top + 4` and the columns 5 to width - 5. */
export function bar(width: number, height: number, top: number): Pixels {
  const image = solid(width, height, [255, 255, 255]);
  for (let row = top; row < top + 4; row += 1) {
    for (let column = 5; column < width - 5; column += 1) {
      image.data.set([20, 20, 20, 255], (row * width + column) * 4);
    }
  }
  return image;
}
