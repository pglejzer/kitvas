// The editor's compiler: esbuild's one-file `transform` with the options the build uses for
// element ids (render/adapters/esbuild-bundler.ts), so an id found here is the id the build gave.

import { loadDep } from '../../shared/index.ts';
import type { EditCompiler } from '../ports/compiler.ts';

type Esbuild = typeof import('esbuild');

/** The compiler and a way to stop the esbuild service it keeps running. */
export type EsbuildCompiler = EditCompiler & { dispose(): Promise<void> };

/** `roots`: where packages are looked up, first match wins. esbuild loads on the first compile. */
export function createEsbuildCompiler(roots: string[]): EsbuildCompiler {
  let loaded: Promise<Esbuild> | undefined;
  const esbuild = (): Promise<Esbuild> => {
    loaded ??= loadDep<Esbuild>('esbuild', roots);
    return loaded;
  };

  return {
    async jsxDev(text, file) {
      const { transform } = await esbuild();
      try {
        const result = await transform(text, {
          loader: 'tsx',
          jsx: 'automatic',
          jsxDev: true,
          sourcefile: file,
          logLevel: 'silent',
        });
        return result.code;
      } catch (cause) {
        // esbuild rejects a text that does not parse with its `errors`; anything else is a failure.
        if (Array.isArray((cause as { errors?: unknown }).errors)) return null;
        throw cause;
      }
    },

    async dispose() {
      if (loaded) await (await loaded).stop();
    },
  };
}
