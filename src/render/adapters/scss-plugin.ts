// esbuild plugin: `.scss` imported from code, compiled by the session's one Sass compiler
// (docs/spikes/09-component-styles.md). `*.module.scss` becomes a CSS Module like `*.module.css`.

import { dirname } from 'node:path';
import type { PartialMessage, Plugin } from 'esbuild';
import { relativeFile } from './real-path.ts';
import type { ScssCompile } from './sass-pipeline.ts';

/** esbuild names the plugin on its messages; the adapter reports those as style errors. */
export const SCSS_PLUGIN = 'kitvas-scss';

export type ScssPluginOptions = {
  compile: ScssCompile;
  /** Where `@use "pkg/..."` is looked up: the project's `node_modules`. */
  loadPaths: string[];
  /** Error files are given relative to it, like esbuild's own. */
  workingDir: string;
};

function failureMessage(cause: unknown, path: string, workingDir: string): PartialMessage {
  const failure = cause as { message?: unknown; file?: unknown; line?: unknown; column?: unknown };
  const file = typeof failure.file === 'string' ? failure.file : path;
  const line = typeof failure.line === 'number' ? failure.line : 0;
  const column = typeof failure.column === 'number' ? failure.column : 0;
  return {
    text: typeof failure.message === 'string' ? failure.message : String(cause),
    // esbuild counts columns from 0, Sass's failure from 1.
    location: { file: relativeFile(workingDir, file), line, column: Math.max(column - 1, 0) },
  };
}

export function scssPlugin({ compile, loadPaths, workingDir }: ScssPluginOptions): Plugin {
  return {
    name: SCSS_PLUGIN,
    setup(build) {
      build.onLoad({ filter: /\.scss$/ }, async (args) => {
        try {
          const { css, loaded } = await compile(args.path, loadPaths);
          return {
            contents: css,
            loader: args.path.endsWith('.module.scss') ? 'local-css' : 'css',
            // `url()` in the compiled CSS is relative to the file it came from.
            resolveDir: dirname(args.path),
            watchFiles: loaded,
          };
        } catch (cause) {
          return { errors: [failureMessage(cause, args.path, workingDir)] };
        }
      });
    },
  };
}
