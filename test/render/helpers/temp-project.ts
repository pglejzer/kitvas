// Tiny projects for the adapter tests: a package.json, some of kitvas's own packages linked into
// node_modules, and the files a test names.

import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';

/** Junctions work without admin rights on Windows. */
const LINK = process.platform === 'win32' ? 'junction' : 'dir';

/** Writes a file under `dir`, creating its folders; `relPath` uses forward slashes. */
export function writeFile(dir: string, relPath: string, data: string | Uint8Array): string {
  const file = join(dir, ...relPath.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
}

/** A package of kitvas's own node_modules (`from`) under the name the project has it by (`as`). */
export type PackageLink = string | { from: string; as: string };

/** A new project folder with the named packages of kitvas linked into its node_modules. */
export function tempProject(links: PackageLink[], files: Record<string, string> = {}): string {
  const dir = tempDir('kitvas-project-');
  writeFile(dir, 'package.json', '{ "name": "temp-project", "private": true }\n');
  for (const link of links) {
    const { from, as } = typeof link === 'string' ? { from: link, as: link } : link;
    const path = join(dir, 'node_modules', ...as.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(join(PLUGIN_ROOT, 'node_modules', ...from.split('/')), path, LINK);
  }
  for (const [relPath, text] of Object.entries(files)) writeFile(dir, relPath, text);
  return dir;
}

/** The two packages a Tailwind v4 project has, from kitvas's devDependencies. */
export const TAILWIND_PACKAGES: PackageLink[] = ['tailwindcss', '@tailwindcss/node'];

/** A Tailwind 3 project's one package: kitvas's test copy `tailwindcss3`, as `tailwindcss`. */
export const TAILWIND3_PACKAGES: PackageLink[] = [{ from: 'tailwindcss3', as: 'tailwindcss' }];

/** A Tailwind entry with one theme colour used by a class and one no class uses. */
export const TAILWIND_ENTRY = [
  '@import "tailwindcss";',
  '',
  '@theme {',
  '  --color-brand: #0055ff;',
  '  --color-spare: #123456;',
  '}',
  '',
].join('\n');

/** Class names as a component writes them: valid ones, a variant and two that are no class. */
export const TAILWIND_SOURCE =
  '<div className="flex p-4 bg-brand hover:opacity-90 bg-nope-x not-a-class" />\n';
