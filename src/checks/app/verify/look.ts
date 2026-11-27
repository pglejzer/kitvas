// Step `look`: every example of a written kit that names a reference image looks like it. The
// rendered example and the reference are decoded by the browser and scored by `lookScore`. Only
// advice: the step never blocks a draft.

import { join } from 'node:path';
import { isWrittenKit, type LoadedKit } from '../../../kit/index.ts';
import { type CatalogReport, exampleKey } from '../../../render/index.ts';
import type { LookEntry, VerifyIssue } from '../../domain/kit/kit-verify.ts';
import { LOOK_LINE, lookScore } from '../../domain/kit/look-score.ts';
import type { Capture, CaptureReport } from '../../ports/browser.ts';
import type { ParsedExample } from './example-parse.ts';
import { exampleSearch } from './render.ts';
import { SKIPPED, type StepResult } from './step.ts';

/** The examples and screenshots of a reference are 900 px high. */
const LOOK_HEIGHT = 900;
const DESKTOP = 1280;
const PHONE = 390;

/** A kit whose components an agent wrote into its folder; only these are held to references. */
export const isWritten = (loaded: LoadedKit): boolean => isWrittenKit(loaded.kit);

/** The part of a browser session this step uses. */
export type Capturer = (input: Capture) => Promise<CaptureReport>;

export type LookInput = {
  loaded: LoadedKit;
  /** The catalog build made for this run. */
  build: CatalogReport;
  /** The kit's catalog folder; screenshots go to `<dir>/look/<key>.png`. */
  dir: string;
  examples: ParsedExample[];
  capture: Capturer;
};

/** A reference cut from a phone-width scan (`source/web/1-390/…`) is held to a phone-width page. */
const widthOf = (reference: string): number =>
  reference.split('/').some((part) => /-390$/.test(part)) ? PHONE : DESKTOP;

export async function lookStep(input: LookInput): Promise<StepResult & { look: LookEntry[] }> {
  const { loaded, build, dir, examples, capture } = input;
  if (!isWritten(loaded) || !build.built) return { ...SKIPPED, look: [] };

  const byKey = new Map(examples.map((example) => [example.key, example]));
  const shown = new Set(build.shown);
  const issues: VerifyIssue[] = [];
  const look: LookEntry[] = [];

  for (const [index, component] of loaded.kit.components.entries()) {
    // The project's additions were crafted, not cut from the kit's source: they have no reference.
    if (loaded.additions.includes(component.name)) continue;
    let referenced = 0;
    for (const [number, example] of component.examples.entries()) {
      const reference = example.reference;
      if (reference === undefined) continue;
      referenced += 1;
      const key = exampleKey(component.name, number);
      // An example that did not build or show is the `render` step's finding.
      const parsed = byKey.get(key);
      if (!parsed || !shown.has(key)) continue;

      let report: CaptureReport;
      try {
        report = await capture({
          page: build.path,
          search: exampleSearch(key),
          width: widthOf(reference),
          height: LOOK_HEIGHT,
          shot: join(dir, 'look', `${key}.png`),
          reference: join(loaded.dir, ...reference.split('/')),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        issues.push(unreadable(parsed.path, key, detail));
        continue;
      }

      if (!report.rendered || !report.reference) {
        const detail = report.errors.join('; ') || 'no image';
        issues.push(unreadable(parsed.path, key, detail));
        continue;
      }
      const result = lookScore(report.reference, report.rendered);
      look.push({
        key,
        score: result.score,
        size: result.size,
        colour: result.colour,
        structure: result.structure,
      });
      if (result.score < LOOK_LINE) {
        issues.push({
          step: 'look',
          path: parsed.path,
          key: 'kitIssue.lookFar',
          params: {
            key,
            score: result.score,
            size: result.size,
            colour: result.colour,
            structure: result.structure,
          },
        });
      }
    }
    // A `code` kit says how each component was compared (`compared`), so it gets no advice here.
    if (referenced === 0 && loaded.kit.source.type !== 'code') {
      issues.push({
        step: 'look',
        path: `components.${index}`,
        key: 'kitIssue.lookNoReference',
        params: { component: component.name },
      });
    }
  }

  // A component without a reference is advice; a far or unreadable one fails the step.
  const failed = issues.some((issue) => issue.key !== 'kitIssue.lookNoReference');
  return { state: failed ? 'failed' : 'passed', issues, look };
}

const unreadable = (path: string, key: string, detail: string): VerifyIssue => ({
  step: 'look',
  path,
  key: 'kitIssue.lookUnreadable',
  params: { key, detail },
});
