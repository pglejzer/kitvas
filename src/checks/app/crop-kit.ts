// Use case: `kitvas kit crop`. Cuts the boxes the learn skill or the tailor agent wrote into
// `source/<folder>/boxes.json` out of the kit's source images, one `source/refs/<name>.png` each.

import { join } from 'node:path';
import { BOXES_FILE, BoxesSchema, type CropBox, type KitStore, REFS_DIR } from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import type { Browser, Crop } from '../ports/browser.ts';

export type CropDeps = { kits: KitStore; browser: Browser };

export type CropResult = {
  id: string;
  /** Kit paths of the references written. */
  written: string[];
  /** A bad boxes file or one box that could not be cut; the others still are. */
  errors: { name: string; message: string }[];
};

/** Folders of `source/` that may hold a boxes file: Figma sheets, the person's images, scanned pages. */
const SOURCE_FOLDERS = ['figma', 'images', 'web'];

/**
 * Cuts every box of every boxes file of the kit. A boxes file that does not parse is one error line,
 * not a throw; so is a box whose image is missing, a repeated name or a box outside its image.
 */
export async function cropKit(deps: CropDeps, _project: string, id: string): Promise<CropResult> {
  const files = deps.kits.read(id);
  if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });

  const errors: CropResult['errors'] = [];
  const seen = new Set<string>();
  const boxes: CropBox[] = [];
  for (const folder of SOURCE_FOLDERS) {
    const file = `source/${folder}/${BOXES_FILE}`;
    if (!deps.kits.exists(id, file)) continue;
    const parsed = BoxesSchema.safeParse(deps.kits.readJson(id, file));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.join('.') ?? '';
      errors.push({
        name: file,
        message: `not a list of boxes${where ? ` (${where}: ${first?.message ?? ''})` : ''}`,
      });
      continue;
    }
    for (const box of parsed.data) {
      if (seen.has(box.name)) {
        errors.push({ name: box.name, message: 'the name is used by an earlier box' });
        continue;
      }
      seen.add(box.name);
      if (!deps.kits.exists(id, box.image)) {
        errors.push({ name: box.name, message: `${box.image} does not exist` });
        continue;
      }
      boxes.push(box);
    }
  }
  if (boxes.length === 0) return { id, written: [], errors };

  const inputs: Crop[] = boxes.map((box) => ({
    image: join(files.dir, ...box.image.split('/')),
    box: box.box,
    scale: box.scale,
    out: join(files.dir, ...REFS_DIR.split('/'), `${box.name}.png`),
  }));

  const session = await deps.browser.open();
  const written: string[] = [];
  try {
    if (!session.crop) throw new KitvasError('BROWSER_MISSING');
    const reports = await session.crop(inputs);
    for (const [index, box] of boxes.entries()) {
      const report = reports[index];
      if (report?.state === 'written') written.push(`${REFS_DIR}/${box.name}.png`);
      else {
        errors.push({ name: box.name, message: report?.error ?? 'the browser gave no answer' });
      }
    }
  } finally {
    await session.close();
  }
  return { id, written, errors };
}
