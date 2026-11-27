// The Sass pipeline: one embedded compiler for as long as the pipeline lives. It compiles the
// sheets of drafts and kits, and the `.scss` files components import (through `compileFile`,
// which the esbuild adapter's Sass plugin calls).

import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDep, pathTargets } from '../../shared/index.ts';
import type { BuildError } from '../domain/report.ts';
import type { StylePipeline } from '../ports/style-pipeline.ts';
import { relativeFile } from './real-path.ts';

type Sass = typeof import('sass-embedded');
type Compiler = import('sass-embedded').AsyncCompiler;

/** The CSS of one file and the files Sass read for it. */
export type ScssResult = { css: string; loaded: string[] };

/** Where a load that is not beside its file is looked up. */
export type ScssLookup = {
  /** The project's import patterns (`ProjectResolve.paths`), tried first, as in its scripts. */
  paths: Record<string, string[]>;
  /** Then these folders: the project's `node_modules`, for `@use "pkg/..."`. */
  loadPaths: string[];
};

/** Rejects with a `ScssFailure`. */
export type ScssCompile = (file: string, lookup: ScssLookup) => Promise<ScssResult>;

/** Where Sass stopped: `file` absolute, `line` and `column` 1-based (0 when unknown). */
export type ScssFailure = Error & { file: string; line: number; column: number };

export type SassPipeline = StylePipeline & { compileFile: ScssCompile };

const TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Sass did not answer in time.')), TIMEOUT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

type SassFailure = {
  sassMessage?: string;
  message?: string;
  span?: { url?: URL; start?: { line: number; column: number } };
};

function toFailure(cause: unknown, file: string): ScssFailure {
  const failure = cause as SassFailure;
  const url = failure.span?.url;
  return Object.assign(new Error(failure.sassMessage ?? failure.message ?? String(cause)), {
    file: url?.protocol === 'file:' ? fileURLToPath(url) : file,
    line: (failure.span?.start?.line ?? -1) + 1,
    column: (failure.span?.start?.column ?? -1) + 1,
  });
}

function toError(cause: unknown, file: string, workingDir: string): BuildError {
  const failure = toFailure(cause, file);
  return {
    source: 'styles',
    file: relativeFile(workingDir, failure.file),
    line: failure.line,
    column: failure.column,
    message: failure.message,
  };
}

/** A load with a scheme (`sass:math`, `pkg:`, `https:`) is never a path of the project. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Importers that follow the project's import patterns. A pattern may have several targets, and
 * Sass asks the next importer when one finds no file, so the n-th importer answers with the n-th
 * target. Sass itself then looks for the partial, the extension and the index file.
 */
function pathImporters(
  paths: Record<string, string[]>,
): { findFileUrl(url: string): URL | null }[] {
  const most = Math.max(0, ...Object.values(paths).map((targets) => targets.length));
  return Array.from({ length: most }, (_, index) => ({
    findFileUrl(url: string): URL | null {
      const target = SCHEME.test(url) ? undefined : pathTargets(paths, url)[index];
      return target === undefined ? null : pathToFileURL(target);
    },
  }));
}

export function createSassPipeline({ roots }: { roots: string[] }): SassPipeline {
  let started: Promise<Compiler> | undefined;
  const compiler = (): Promise<Compiler> => {
    started ??= loadDep<Sass>('sass-embedded', roots).then((sass) => sass.initAsyncCompiler());
    return started;
  };

  return {
    async compile(files, workingDir) {
      const sass = await compiler();
      const parts: string[] = [];
      const errors: BuildError[] = [];
      for (const file of files) {
        try {
          const result = await withTimeout(sass.compileAsync(file, { style: 'expanded' }));
          parts.push(result.css);
        } catch (cause) {
          errors.push(toError(cause, file, workingDir));
        }
      }
      return { css: parts.join('\n'), errors };
    },

    async compileFile(file, { paths, loadPaths }) {
      const sass = await compiler();
      try {
        const result = await withTimeout(
          sass.compileAsync(file, {
            style: 'expanded',
            importers: pathImporters(paths),
            loadPaths,
          }),
        );
        const loaded = result.loadedUrls
          .filter((url) => url.protocol === 'file:')
          .map((url) => fileURLToPath(url));
        return { css: result.css, loaded };
      } catch (cause) {
        throw toFailure(cause, file);
      }
    },

    async dispose() {
      if (started) await (await started).dispose();
    },
  };
}
