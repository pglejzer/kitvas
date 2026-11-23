// Turns style sources into CSS. Stage 1 has one pipeline: Sass.

import type { BuildError } from '../domain/report.ts';

export type StyleOutput = { css: string; errors: BuildError[] };

export interface StylePipeline {
  /** Compiles each file (absolute paths) and joins the results in order. */
  compile(files: string[], workingDir: string): Promise<StyleOutput>;
  dispose(): Promise<void>;
}
