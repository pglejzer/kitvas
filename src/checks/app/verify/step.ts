// What every step of `kit verify` returns.

import type { BuildError } from '../../../render/index.ts';
import type { StepState, VerifyIssue, VerifyStep } from '../../domain/kit/kit-verify.ts';
import type { Inspect, InspectReport } from '../../ports/browser.ts';

/** The part of a browser session the steps use. */
export type Inspector = (input: Inspect) => Promise<InspectReport>;

/** A bundler or style error with its place, the same text whichever step meets it. */
export const buildErrorText = (error: BuildError): string =>
  error.file ? `${error.message} (${error.file}:${error.line})` : error.message;

export type StepResult = { state: StepState; issues: VerifyIssue[] };

export const SKIPPED: StepResult = { state: 'skipped', issues: [] };

/** A step that ran: failed when it found anything. */
export const ran = (issues: VerifyIssue[]): StepResult => ({
  state: issues.length > 0 ? 'failed' : 'passed',
  issues,
});

/** Text of esbuild, Sass or tsc, passed on unchanged. */
export const toolIssue = (step: VerifyStep, path: string, text: string): VerifyIssue => ({
  step,
  path,
  key: 'checkRule.tool',
  params: { text },
});
