// `kitvas kit crop`: the boxes to cut out of a kit's source images. The learn skill writes them for
// Figma sheets (`source/figma/boxes.json`), the tailor agent for the person's images
// (`source/images/boxes.json`); each box becomes `source/refs/<name>.png`, an example's reference.

import { type Zod, z } from '../../shared/index.ts';
import { REFERENCE_PATH } from './contract.ts';

export const BOXES_FILE = 'boxes.json';
export const REFS_DIR = 'source/refs';
export const BOXES_MAX = 500;

const BoxSchema = z.strictObject({
  /** The image to cut from, a kit path under `source/`. */
  image: z.string().regex(REFERENCE_PATH),
  /** x, y, width, height in the image's own pixels. */
  box: z.tuple([
    z.number().int().min(0),
    z.number().int().min(0),
    z.number().int().min(1),
    z.number().int().min(1),
  ]),
  /**
   * Image pixels per CSS pixel: a Figma sheet rendered at twice its size has 2. The crop is scaled
   * by 1 / scale, so a reference has the size the component has in the browser.
   */
  scale: z.number().positive().default(1),
  /** File name of the reference without `.png`: `Button.1`. */
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
});

export const BoxesSchema = z.array(BoxSchema).max(BOXES_MAX);
export type CropBox = Zod.infer<typeof BoxSchema>;
