// The answer of `kitvas handoff compare`: one result per width, and the reader that turns what the
// browser reported into that result. Pure: the look score and the line come in as arguments.

import type { LookResult, MatchReport, Pixels } from '../../../checks/index.ts';

export type CompareResult =
  | {
      width: number;
      state: 'scored';
      score: number;
      size: number;
      colour: number;
      structure: number;
      line: number;
      scale: number;
      shot: string;
      reference: string;
    }
  | {
      width: number;
      state: 'no-reference' | 'blocked' | 'missing' | 'failed';
      detail: string;
    };

export type Compared = { results: CompareResult[]; passed: boolean };

/** Where the images of one width are, as the result names them. */
export type CompareFiles = { shot: string; reference: string };

/**
 * One width's result from the browser's report. A page the browser could not compare is never given
 * a score: `blocked` names the address, `missing` the selector, `failed` the browser's own words.
 */
export function compareResult(input: {
  width: number;
  report: MatchReport;
  files: CompareFiles;
  line: number;
  look(reference: Pixels, rendered: Pixels): LookResult;
}): CompareResult {
  const { width, report, files, line } = input;
  switch (report.state) {
    case 'blocked':
      return { width, state: 'blocked', detail: report.url };
    case 'missing':
      return { width, state: 'missing', detail: report.selector };
    case 'failed':
      return { width, state: 'failed', detail: report.error };
    case 'matched': {
      const { score, size, colour, structure } = input.look(report.reference, report.rendered);
      return {
        width,
        state: 'scored',
        score,
        size,
        colour,
        structure,
        line,
        scale: report.scale,
        shot: files.shot,
        reference: files.reference,
      };
    }
  }
}

/** True when there is at least one result and every one is scored at or over its line. */
export function comparePassed(results: readonly CompareResult[]): boolean {
  return (
    results.length > 0 &&
    results.every((result) => result.state === 'scored' && result.score >= result.line)
  );
}
