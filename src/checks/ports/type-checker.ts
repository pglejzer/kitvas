// Checks the draft's TSX against the kit's types.

import type { DeclaredResolve } from '../../shared/index.ts';
import type { ToolMessage } from '../domain/code/tsc.ts';

export type TypeCheckInput = {
  /** Absolute folder of the draft version; tsc runs there, so its paths start with `src/`. */
  workingDir: string;
  /** Absolute path of the draft's src/tsx/index.tsx. */
  entry: string;
  /** Absolute path of the kit's entry file. */
  kitEntry: string;
  /**
   * The project of a project kit: React's types come from its node_modules when it has them, and
   * its import patterns and type files from its tsconfig.json (ADR 0092).
   */
  project?: string | undefined;
  /** `resolve` of the kit's kit.json: what the project's build configuration adds to that. */
  resolve?: DeclaredResolve | undefined;
};

export interface TypeChecker {
  check(input: TypeCheckInput): Promise<ToolMessage[]>;
}
