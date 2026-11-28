// Compiling a project's own style files, so an original component can be drawn with its real
// styles. The project is in any technology and is never built.

import type { DeclaredResolve, ProjectResolve } from '../../shared/index.ts';
import type { UtilityCss } from './utility-css.ts';

export type ProjectStyleInput = {
  /** Absolute project folder. */
  project: string;
  /** Project path of the style file, forward slashes. */
  file: string;
  /** The kit's `resolve`. */
  resolve: DeclaredResolve | undefined;
  /**
   * Absolute files whose text holds class names. A style file with Tailwind in it is built for
   * these files; any other style file ignores them.
   */
  sources?: string[];
};

export type ProjectStyleResult =
  | { ok: true; css: string }
  | { ok: false; reason: 'missing' | 'unsupported' | 'failed'; detail: string };

export type ProjectStyles = (input: ProjectStyleInput) => Promise<ProjectStyleResult>;

/** The languages the compiler reads. */
export type StyleSyntax = 'css' | 'scss' | 'indented';

/** Where a load that is not beside its file is looked up (the project's own way, ADR 0092). */
export type StyleLookup = { paths: Record<string, string[]>; loadPaths: string[] };

/**
 * Compiles `text` as if it were the file `file` (absolute), so relative loads start from its
 * folder. Rejects with an error that may carry `file` and `line` (1-based).
 */
export type CompileStyleText = (
  text: string,
  file: string,
  syntax: StyleSyntax,
  lookup: StyleLookup,
) => Promise<{ css: string }>;

export type ProjectStylesDeps = {
  /** The text of a file, or `undefined` when it is not there. */
  read: (file: string) => string | undefined;
  exists: (file: string) => boolean;
  /** The lookup of loads for a project; the one a `repo` kit's Sass uses. */
  lookup: (project: string, found: ProjectResolve) => StyleLookup;
  compile: CompileStyleText;
  /** The project's own Tailwind: builds a style file that holds `@tailwind` or `@import "tailwindcss"`. */
  utility: UtilityCss;
};
