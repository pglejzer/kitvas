// Where a kit's built examples are, and the stamp that says which of them were built.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readVerifyFile, VERIFY_FILE, type VerifyFile } from '../../checks/index.ts';
import { CATALOG_STAMP, type CatalogStamp, readCatalogStamp } from '../../render/index.ts';
import { catalogDir } from '../../shared/index.ts';

/** The `build/` folder of one kit's catalog: what the prototype origin serves for `/k/...`. */
export const catalogBuildDir = (project: string, kitId: string): string =>
  join(catalogDir(project, kitId), 'build');

/** Whether the catalog build copied a reference image (`build/img/refs/<file>`, in a folder the prototype origin serves). */
export function refFileExists(project: string, kitId: string, file: string): boolean {
  try {
    return statSync(join(catalogBuildDir(project, kitId), 'img', 'refs', file)).isFile();
  } catch {
    return false;
  }
}

/** The stamp of the last good catalog build; `undefined` when there is none or it is unreadable. */
export function readStampFile(project: string, kitId: string): CatalogStamp | undefined {
  let text: string;
  try {
    text = readFileSync(join(catalogDir(project, kitId), CATALOG_STAMP), 'utf8');
  } catch {
    return undefined;
  }
  return readCatalogStamp(text);
}

/** What the last `kitvas kit verify` left; `undefined` when there is none or it is unreadable. */
export function readVerifyJson(project: string, kitId: string): VerifyFile | undefined {
  let text: string;
  try {
    text = readFileSync(join(catalogDir(project, kitId), VERIFY_FILE), 'utf8');
  } catch {
    return undefined;
  }
  return readVerifyFile(text);
}
