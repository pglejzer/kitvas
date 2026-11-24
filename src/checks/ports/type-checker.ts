// Checks the draft's TSX against the kit's types.

import type { ToolMessage } from '../domain/code/tsc.ts';

export type TypeCheckInput = {
  /** Absolute folder of the draft version; tsc runs there, so its paths start with `src/`. */
  workingDir: string;
  /** Absolute path of the draft's src/tsx/index.tsx. */
  entry: string;
  /** Absolute path of the kit's entry file. */
  kitEntry: string;
  /** The project of a project kit: React's types come from its node_modules when it has them. */
  project?: string | undefined;
};

export interface TypeChecker {
  check(input: TypeCheckInput): Promise<ToolMessage[]>;
}
