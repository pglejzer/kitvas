// esbuild plugin for `Bundler.exportNames`: one entry a module, made in memory as
// `export * from "<module>"`, so the metafile lists what each module exports. Nothing is written
// and nothing of a module runs.

import type { Metafile, Plugin } from 'esbuild';

/** The plugin's name and the namespace of its entries. */
export const EXPORTS_PROBE = 'kitvas-exports';
const ENTRY = /^kitvas-exports:(\d+)$/;

/** The entry points of the build: one a module, by its place in the list. */
export const probeEntries = (modules: readonly string[]): { in: string; out: string }[] =>
  modules.map((_, index) => ({ in: `${EXPORTS_PROBE}:${index}`, out: `probe-${index}` }));

/** Makes each entry re-export its module, resolved from `resolveDir` as an import of the project. */
export function exportsProbe(modules: readonly string[], resolveDir: string): Plugin {
  return {
    name: EXPORTS_PROBE,
    setup(build) {
      build.onResolve({ filter: ENTRY }, ({ path }) => ({ path, namespace: EXPORTS_PROBE }));
      build.onLoad({ filter: /.*/, namespace: EXPORTS_PROBE }, ({ path }) => {
        const target = modules[Number(ENTRY.exec(path)?.[1] ?? -1)];
        if (target === undefined) return { errors: [{ text: `No module for "${path}"` }] };
        const contents = `export * from ${JSON.stringify(target)};\n`;
        return { contents, loader: 'js', resolveDir };
      });
    },
  };
}

/** The names the probe's entries export, each once, sorted. */
export function exportedNames(metafile: Metafile | undefined): string[] {
  const names = new Set<string>();
  for (const output of Object.values(metafile?.outputs ?? {})) {
    if (output.entryPoint === undefined) continue;
    for (const name of output.exports) names.add(name);
  }
  return [...names].sort();
}
