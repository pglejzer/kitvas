// Step `render`: every example of the built catalog shows in the browser without an error.

import type { Bundler, CatalogReport } from '../../../render/index.ts';
import type { VerifyIssue } from '../../domain/kit-verify.ts';
import { type ParsedExample, parseError } from './example-parse.ts';
import { buildErrorText, type Inspector, type StepResult, toolIssue } from './step.ts';

/** The desktop viewport of the checks. */
export const EXAMPLE_VIEWPORT = { width: 1280, height: 800 };

export const exampleSearch = (key: string): string => `?example=${encodeURIComponent(key)}`;

export type RenderInput = {
  /** The catalog build made for this run. */
  build: CatalogReport;
  /** The kit's catalog folder. */
  dir: string;
  /** Every example of the kit, for its place in kit.json. */
  examples: ParsedExample[];
  /** Keys of examples the `types` step already reported. */
  reported: ReadonlySet<string>;
  inspect: Inspector;
  bundler: Bundler;
};

export async function renderStep(input: RenderInput): Promise<StepResult> {
  const { build, dir, examples, reported, inspect, bundler } = input;
  if (!build.built) {
    const issues = build.errors.map((error) =>
      toolIssue('render', 'runtime.entry', buildErrorText(error)),
    );
    return { state: 'failed', issues };
  }

  const byKey = new Map(examples.map((example) => [example.key, example]));
  const pathOf = (key: string): string => byKey.get(key)?.path ?? 'components';
  const issues: VerifyIssue[] = [];

  // Left out of the bundle because it does not parse; `types` says so first when it ran on it.
  for (const key of build.skipped) {
    if (reported.has(key)) continue;
    const example = byKey.get(key);
    const detail = example ? await parseError(bundler, dir, example) : '';
    issues.push({
      step: 'render',
      path: pathOf(key),
      key: 'kitIssue.exampleRejected',
      params: { key, detail },
    });
  }

  for (const key of build.shown) {
    const report = await inspect({
      page: build.path,
      search: exampleSearch(key),
      ...EXAMPLE_VIEWPORT,
      vars: [],
    });
    const path = pathOf(key);
    if (report.example !== 'shown') {
      issues.push({ step: 'render', path, key: 'kitIssue.exampleNotShown', params: { key } });
    }
    for (const detail of [...report.errors, ...report.failed]) {
      issues.push({
        step: 'render',
        path,
        key: 'kitIssue.exampleError',
        params: { key, detail },
      });
    }
  }
  return { state: issues.length > 0 ? 'failed' : 'passed', issues };
}
