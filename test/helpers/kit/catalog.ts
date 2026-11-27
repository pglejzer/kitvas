// A kit's built examples on disk, without a real catalog build.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CATALOG_STAMP, type CatalogStamp } from '../../../src/render/index.ts';
import { catalogDir } from '../../../src/shared/index.ts';

export const KIT_STAMP: CatalogStamp = {
  schemaVersion: 1,
  kit: 'kitvas-ui',
  key: 'k'.repeat(64),
  shown: ['Button.1'],
  skipped: ['Button.2'],
};

/** Writes the stamp and a small page, script and sheet below the catalog folder of the kit. */
export function writeCatalog(project: string, stamp: CatalogStamp = KIT_STAMP): string {
  const dir = catalogDir(project, stamp.kit);
  const files: Record<string, string> = {
    [CATALOG_STAMP]: JSON.stringify(stamp),
    'build/html/index.html': '<!doctype html><title>Examples</title>',
    'build/js/index.js': 'void 0;',
    'build/css/index.css': 'body { margin: 0; }',
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, ...rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return dir;
}
