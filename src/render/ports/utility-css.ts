// Utility-class CSS generated from the classes a build uses: the person's project's own Tailwind,
// 3 or 4 (docs/spikes/07-tailwind-v4.md, ADR 0094).

import type { TailwindTheme } from '../../shared/index.ts';
import type { BuildError } from '../domain/report.ts';

export type UtilityInput = {
  /** Absolute project folder: the compiler and `@import "tailwindcss"` resolve from its node_modules. */
  project: string;
  /** Absolute path of the kit's Tailwind entry stylesheet (`runtime.styles.tailwind.entry`). */
  entry: string;
  /** Absolute files whose text holds class names: the draft's TSX, the kit's components. */
  sources: string[];
  /**
   * Custom properties (`--color-brand`) and theme paths (`theme(colors.brand)`, as the variable
   * `themeVariable` names) the output must define even when no class uses them.
   */
  probe: string[];
};

export type UtilityOutput = {
  /** The project's Tailwind facts; absent when the build failed. */
  theme?: TailwindTheme;
  css: string;
  /** Candidates that look like classes (contain `-` or `:`) but produced no CSS, sorted. */
  unknown: string[];
  errors: BuildError[];
  /** Absolute files the CSS depends on (the entry and what it imports), for the build's cache key. */
  files: string[];
};

export interface UtilityCss {
  build(input: UtilityInput): Promise<UtilityOutput>;
  /** Stops whatever it keeps running. Safe to call when nothing was started. */
  dispose(): Promise<void>;
}
