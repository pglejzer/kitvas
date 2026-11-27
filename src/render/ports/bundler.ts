// Turns TSX into one script for the browser.

import type { DeclaredResolve } from '../../shared/index.ts';
import type { BuildError } from '../domain/report.ts';

export type BundleInput = {
  /** Absolute folder of the draft version; file names in errors and ids are relative to it. */
  workingDir: string;
  entry: { name: string; source: string };
  /** Import names to absolute files: `@kit`, `@draft`. */
  alias: Record<string, string>;
  /** `<file>:<line>:<column>` to element id, compiled into the bundle. */
  ids: Record<string, string>;
  /**
   * The project of a project kit: its `node_modules` supply `react` and `react-dom` when it has
   * them, and scripts and Sass files find their imports as its tsconfig.json says and then in its
   * `node_modules` (ADR 0092). Absent for a built-in kit.
   */
  project?: string | undefined;
  /** `resolve` of the kit's kit.json: what the project's build configuration adds to that. */
  resolve?: DeclaredResolve | undefined;
  /**
   * A plain script for a runtime outside the page (the hand-off's Figma builder): minified, and
   * the entry's exports kept on `var <globalName>`. Absent for drafts and catalogs.
   */
  script?: { globalName: string } | undefined;
};

export type BundleOutput = {
  js: string;
  /** CSS the bundled modules imported (plain CSS, CSS Modules, SCSS), in import order. */
  css: string;
  errors: BuildError[];
};

export type ExportsInput = {
  /** Absolute folder the modules are resolved from (the project); nothing is written there. */
  workingDir: string;
  /** Package specifiers or absolute files with forward slashes; each is read on its own. */
  modules: string[];
  /** As in BundleInput: the project whose `react`, `react-dom` and import patterns the modules get. */
  project?: string | undefined;
  /** As in BundleInput. */
  resolve?: DeclaredResolve | undefined;
};

export type ExportsOutput = {
  /** The names the modules export at run time, each once, sorted; types are not among them. */
  names: string[];
  /** Why the modules did not bundle; `names` is then empty. */
  errors: BuildError[];
};

export interface Bundler {
  /** One file compiled alone with JSX as dev calls. `undefined` when it does not parse. */
  transform(source: string, file: string): Promise<string | undefined>;
  bundle(input: BundleInput): Promise<BundleOutput>;
  /**
   * What modules export (`kit exports`, ADR 0081): each is bundled behind a probe that re-exports
   * it, and the names are read from the bundler's account of the probe. No code of a module runs.
   */
  exportNames(input: ExportsInput): Promise<ExportsOutput>;
  /** Stops whatever the bundler keeps running. Safe to call when nothing was started. */
  dispose(): Promise<void>;
}
