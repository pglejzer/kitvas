// Turns TSX into one script for the browser.

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
   * them, and its `node_modules` folder is a Sass load path. Absent for a built-in kit.
   */
  project?: string | undefined;
};

export type BundleOutput = {
  js: string;
  /** CSS the bundled modules imported (plain CSS, CSS Modules, SCSS), in import order. */
  css: string;
  errors: BuildError[];
};

export interface Bundler {
  /** One file compiled alone with JSX as dev calls. `undefined` when it does not parse. */
  transform(source: string, file: string): Promise<string | undefined>;
  bundle(input: BundleInput): Promise<BundleOutput>;
  /** Stops whatever the bundler keeps running. Safe to call when nothing was started. */
  dispose(): Promise<void>;
}
