// `kit new` for kits an agent writes (Figma, website, screenshots): the source is checked here, the
// screenshots are chosen and copied. Nothing touches the network and nothing is written before
// every check has passed.

import { KitvasError } from '../../shared/index.ts';
import {
  FIGMA_URL,
  PROJECT_PATH,
  parseKitSource,
  REFERENCE_PATH,
  WEB_URL,
  type WrittenSource,
} from '../domain/contract.ts';
import { IMAGE_BYTES_MAX, IMAGES_MAX, imageType } from '../domain/images.ts';
import type { SourceFlag } from '../domain/sources.ts';
import type { KitStore } from '../ports/kit-store.ts';
import type { KitWriter } from '../ports/kit-writer.ts';
import type { ProjectSetup } from '../ports/project-files.ts';

/** Why a file of the images folder was not copied: a message key (`kits.new.skip.*`). */
export type SkipReason =
  | 'kits.new.skip.name'
  | 'kits.new.skip.unreadable'
  | 'kits.new.skip.size'
  | 'kits.new.skip.type';

/** A file of the images folder that was not copied, and why. */
export type SkippedImage = { file: string; reason: SkipReason };

/** Where copied screenshots go inside the kit folder. */
export const IMAGES_DIR = 'source/images';

export type ImagePlan = {
  /** The project folder the images come from. */
  folder: string;
  /** Paths inside that folder of the files to copy. */
  copies: string[];
  skipped: SkippedImage[];
};

const BAD_NAME: SkipReason = 'kits.new.skip.name';

const invalid = (detail: string): KitvasError => new KitvasError('KIT_SOURCE_INVALID', { detail });

/** A folder of the project that exists and stays inside it. Throws KIT_SOURCE_INVALID. */
function checkFolder(files: ProjectSetup, folder: string): void {
  if (!PROJECT_PATH.test(folder)) {
    throw invalid(
      `"${folder}" is not a folder of the project (a path from its root, without "..")`,
    );
  }
  if (!files.exists(folder)) throw invalid(`"${folder}" does not exist`);
  if (!files.realInside(folder)) throw invalid(`"${folder}" leads outside the project`);
}

function imagePlan(files: ProjectSetup, folder: string): ImagePlan {
  checkFolder(files, folder);
  const copies: string[] = [];
  const skipped: SkippedImage[] = [];
  for (const rel of files.listFiles(folder)) {
    const path = `${folder}/${rel}`;
    // The project's file API takes only project paths (no spaces, no `:`); such a file is not read.
    if (!PROJECT_PATH.test(path)) {
      skipped.push({ file: path, reason: BAD_NAME });
      continue;
    }
    const size = files.size(path);
    if (size === undefined) {
      skipped.push({ file: path, reason: 'kits.new.skip.unreadable' });
      continue;
    }
    if (size > IMAGE_BYTES_MAX) {
      skipped.push({ file: path, reason: 'kits.new.skip.size' });
      continue;
    }
    const bytes = files.readBytes(path);
    if (bytes === undefined || imageType(bytes) === undefined) {
      skipped.push({ file: path, reason: 'kits.new.skip.type' });
      continue;
    }
    // The boxes of `kit crop` name an image by a reference path, so only such names are copied.
    if (!REFERENCE_PATH.test(`${IMAGES_DIR}/${rel}`)) {
      skipped.push({ file: path, reason: BAD_NAME });
      continue;
    }
    copies.push(rel);
    if (copies.length > IMAGES_MAX) throw invalid(`more than ${IMAGES_MAX} images in "${folder}"`);
  }
  if (copies.length === 0) throw invalid(`"${folder}" has no PNG, JPEG or WebP image`);
  return { folder, copies, skipped };
}

/** The source a written kit stores, and for screenshots the files to copy. Throws KIT_SOURCE_INVALID. */
export function resolveWrittenSource(
  files: ProjectSetup,
  from: SourceFlag,
): { source: WrittenSource; images: ImagePlan | undefined } {
  switch (from.type) {
    case 'figma':
      if (!FIGMA_URL.test(from.value)) {
        throw invalid(
          `"${from.value}" is not a Figma design link (https://www.figma.com/design/…)`,
        );
      }
      return { source: { type: 'figma', url: from.value }, images: undefined };
    case 'web':
      if (!WEB_URL.test(from.value)) {
        throw invalid(`"${from.value}" is not an http or https address`);
      }
      return { source: { type: 'web', urls: [from.value] }, images: undefined };
    case 'images':
      return { source: { type: 'images' }, images: imagePlan(files, from.value) };
    case 'code':
      checkFolder(files, from.value);
      return {
        source: { type: 'code', path: from.value, styles: [], urls: [] },
        images: undefined,
      };
    default:
      throw invalid(`"${from.type}" is not a written source`);
  }
}

export type AddedImages = { id: string; copied: number; skipped: SkippedImage[] };

/**
 * `kit images`: copies a project folder of screenshots into `source/images/` of a written kit, by
 * the plan and the limits of `kit new --from images:`. KIT_NOT_FOUND for no such kit;
 * KIT_SOURCE_INVALID for a built-in kit, a source that is not written, or a bad folder.
 */
export function addImages(
  deps: { kits: KitStore; kitWriter: KitWriter; files: ProjectSetup },
  id: string,
  folder: string,
): AddedImages {
  const found = deps.kits.read(id);
  if (!found) throw new KitvasError('KIT_NOT_FOUND', { id });
  if (found.project === undefined) throw invalid(`kit "${id}" is built in`);
  const source = parseKitSource(found.kitJson, id);
  if (!['figma', 'web', 'images', 'code'].includes(source.type)) {
    throw invalid(`kit "${id}" is not a written kit; it keeps no screenshots`);
  }
  const plan = imagePlan(deps.files, folder);
  copyImages(deps.kitWriter, deps.files, id, plan);
  return { id, copied: plan.copies.length, skipped: plan.skipped };
}

/** Copies the planned screenshots to `source/images/<same relative path>`. */
export function copyImages(
  writer: KitWriter,
  files: ProjectSetup,
  id: string,
  plan: ImagePlan,
): void {
  for (const rel of plan.copies) {
    const bytes = files.readBytes(`${plan.folder}/${rel}`);
    if (bytes === undefined) continue;
    writer.writeBytes(id, `${IMAGES_DIR}/${rel}`, bytes);
  }
}
