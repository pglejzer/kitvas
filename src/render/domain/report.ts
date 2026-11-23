// What a build reports.

import type { Issue } from '../../shared/index.ts';

export type BuildError = {
  source: 'bundle' | 'styles';
  /** Path inside the draft version when the file is there, with forward slashes. */
  file: string;
  /** 1-based; 0 when unknown. */
  line: number;
  column: number;
  message: string;
};

/** Paths inside the draft folder. */
export type BuildFiles = { html: string; js: string; css: string; ids: string };

export type BuildReport = {
  slug: string;
  version: number;
  /** False when the bundle or the styles had errors; the previous output is left as it was. */
  built: boolean;
  /** True when nothing changed since the last build and no work was done. */
  cached: boolean;
  errors: BuildError[];
  warnings: Issue[];
  /** Number of elements that have an id. */
  elements: number;
  files: BuildFiles;
  /** Absolute path of the page. */
  path: string;
};

/** Inside a version folder: what a Tailwind build of the draft left unexplained, for the ds check. */
export const TAILWIND_FILE = 'build/json/tailwind.json';

export type TailwindFile = {
  schemaVersion: 1;
  /** Class-like candidates that produced no CSS (`UtilityOutput.unknown`), sorted. */
  unknown: string[];
};

/** `base` is the version folder: `v1`. */
export const buildFiles = (base: string): BuildFiles => ({
  html: `${base}/build/html/index.html`,
  js: `${base}/build/js/index.js`,
  css: `${base}/build/css/index.css`,
  ids: `${base}/build/json/ids.json`,
});
