// The studio's browser scripts: `client/studio/<name>.ts` bundled by esbuild on first use.
// And the files of its typeface, read from the font package on first use.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KitvasError, loadDep, resolveDep } from '../../shared/index.ts';
import type { ScriptName, StudioAssets } from '../pages/asset-routes.ts';
import { FONT_PACKAGE, type FontFile } from '../pages/fonts.ts';

type Esbuild = typeof import('esbuild');

export type EsbuildAssetsOptions = {
  /** Where packages are looked up, first match wins. */
  roots: string[];
  /** The plugin's `client` folder. */
  clientDir: string;
};

/** esbuild rejects with `errors`; the first one is what a person needs to read. */
function firstError(cause: unknown): KitvasError {
  const first = (cause as { errors?: import('esbuild').Message[] }).errors?.[0];
  const where = first?.location ? `${first.location.file}:${first.location.line}: ` : '';
  const detail = first ? `${where}${first.text}` : String(cause);
  return new KitvasError('INTERNAL', { detail });
}

export function createEsbuildAssets({ roots, clientDir }: EsbuildAssetsOptions): StudioAssets {
  const bundles = new Map<ScriptName, Promise<string>>();
  const fonts = new Map<FontFile, Promise<Buffer>>();

  async function bundle(name: ScriptName): Promise<string> {
    const { build } = await loadDep<Esbuild>('esbuild', roots);
    try {
      const result = await build({
        entryPoints: [join(clientDir, 'studio', `${name}.ts`)],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
        logLevel: 'silent',
      });
      return result.outputFiles[0]?.text ?? '';
    } catch (cause) {
      throw firstError(cause);
    }
  }

  return {
    script(name) {
      let text = bundles.get(name);
      if (!text) {
        text = bundle(name);
        bundles.set(name, text);
        // A failed bundle is not kept: the next request tries again after the file is fixed.
        text.catch(() => bundles.delete(name));
      }
      return text;
    },
    font(name) {
      let bytes = fonts.get(name);
      if (!bytes) {
        // A missing package is `DEPS_MISSING`, raised here as a rejection like a failed read.
        bytes = Promise.resolve().then(() =>
          readFile(resolveDep(`${FONT_PACKAGE}/files/${name}`, roots)),
        );
        fonts.set(name, bytes);
        bytes.catch(() => fonts.delete(name));
      }
      return bytes;
    },
  };
}
