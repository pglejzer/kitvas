// Step `original`: each example of a `code` kit that names an original is drawn from the project's
// own markup and compiled styles, and the copy's page and the original's page are measured and
// compared in numbers (ADR 0093). Never throws: what cannot be drawn is advice, what cannot be
// measured is an issue. A failed step makes `valid` false but never blocks a draft.

import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadedKit } from '../../../kit/index.ts';
import {
  type BuildFs,
  CATALOG_BODY_RULE,
  type CatalogReport,
  exampleKey,
  type ProjectStyles,
} from '../../../render/index.ts';
import type { Drawn } from '../../domain/kit/compared.ts';
import type { OriginalEntry, VerifyIssue } from '../../domain/kit/kit-verify.ts';
import { lookScore, ORIGINAL_LINE } from '../../domain/kit/look-score.ts';
import {
  compareLayers,
  compareOutlines,
  DIFFS_MAX,
  type OriginalDiff,
} from '../../domain/kit/original-compare.ts';
import {
  hasBreakpoint,
  needsBuild,
  type OriginalStyle,
  originalIssue,
  originalMarks,
  originalPage,
  scanStyles,
  sheetCss,
} from '../../domain/kit/original-page.ts';
import type { Measure, MeasuredFrame, MeasureReport } from '../../ports/browser.ts';
import type { ParsedExample } from './example-parse.ts';
import { exampleSearch } from './render.ts';
import { SKIPPED, type StepResult } from './step.ts';

/** The most controls whose three states are read. */
export const CONTROLS_MAX = 4;
const DESKTOP = 1280;
const PHONE = 390;
const HEIGHT = 900;

/** The part of a browser session this step uses. */
export type Measurer = (input: Measure) => Promise<MeasureReport>;

export type OriginalInput = {
  loaded: LoadedKit;
  /** The catalog build made for this run. */
  build: CatalogReport;
  /** The kit's catalog folder; pages and shots go to `<dir>/originals/`. */
  dir: string;
  examples: ParsedExample[];
  measure: Measurer;
  projectStyles: ProjectStyles;
  fs: Pick<BuildFs, 'readText' | 'writeText'>;
};

export type OriginalResult = StepResult & { originals: OriginalEntry[]; drawn: Drawn[] };

const ADVICE = new Set(['kitIssue.originalNotDrawn', 'kitIssue.originalPartial']);

const label = (frame: MeasuredFrame): string =>
  frame.state === 'rest' ? 'rest' : `${frame.state} ${frame.control + 1}`;
const labels = (frames: MeasuredFrame[]): string => frames.map(label).join(', ');

/** A path from the project folder, forward slashes, for a person to open. */
const fromProject = (project: string, file: string): string =>
  relative(project, file).replaceAll('\\', '/');

const failure = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function originalStep(input: OriginalInput): Promise<OriginalResult> {
  const { loaded, build, dir, examples } = input;
  const { kit, project } = loaded;
  const empty: OriginalResult = { ...SKIPPED, originals: [], drawn: [] };
  if (kit.source.type !== 'code' || !build.built || project === undefined) return empty;
  const source = kit.source;

  const byKey = new Map(examples.map((example) => [example.key, example]));
  const shown = new Set(build.shown);
  const base = `${pathToFileURL(project).href.replace(/\/$/, '')}/`;
  const compiled = new Map<string, Awaited<ReturnType<ProjectStyles>>>();
  const compile = async (file: string) => {
    let result = compiled.get(file);
    if (!result) {
      try {
        result = await input.projectStyles({ project, file, resolve: kit.resolve });
      } catch (error) {
        result = { ok: false, reason: 'failed', detail: `${file}: ${failure(error)}` };
      }
      compiled.set(file, result);
    }
    return result;
  };

  const issues: VerifyIssue[] = [];
  const originals: OriginalEntry[] = [];
  const drawn: Drawn[] = [];

  for (const [index, component] of kit.components.entries()) {
    const found: VerifyIssue[] = [];
    const entries: OriginalEntry[] = [];
    let why: Drawn['why'] | undefined;

    for (const [number, example] of component.examples.entries()) {
      if (example.original === undefined) continue;
      const key = exampleKey(component.name, number);
      const parsed = byKey.get(key);
      // An example that did not build or show is the `render` step's finding.
      if (!parsed || !shown.has(key)) continue;
      const at = `components.${index}.examples.${number}`;
      const refuse = (detail: string): void => {
        found.push({
          step: 'original',
          path: at,
          key: 'kitIssue.originalRefused',
          params: { key, detail },
        });
      };

      const markup = input.fs.readText(join(loaded.dir, ...example.original.split('/')));
      if (markup === undefined) {
        refuse('the file is missing');
        continue;
      }
      const refused = originalIssue(markup);
      if (refused !== undefined) {
        refuse(refused);
        continue;
      }

      // The page's styles: the app's own, then each component the fragment marks, in kit order.
      const marks = new Set(originalMarks(markup));
      const wanted: { file: string; scope: string | undefined }[] = [
        ...source.styles.map((file) => ({ file, scope: undefined })),
        ...kit.components
          .filter((other) => marks.has(other.name))
          .flatMap((other) =>
            (other.project?.styles ?? []).map((file) => ({
              file,
              scope: other.project?.scoped ? other.name : undefined,
            })),
          ),
      ];
      const styles: OriginalStyle[] = [];
      let missing: string | undefined;
      for (const { file, scope } of wanted) {
        const result = await compile(file);
        if (!result.ok) {
          missing = result.detail;
          break;
        }
        styles.push({ css: result.css, scope });
      }
      if (missing !== undefined) {
        found.push({
          step: 'original',
          path: at,
          key: 'kitIssue.originalNotDrawn',
          params: { component: component.name, detail: missing },
        });
        why = 'notDrawn';
        break;
      }

      const sheets = styles.map(sheetCss).join('\n');
      const scan = scanStyles(sheets);
      const page = join(dir, 'originals', `${key}.html`);
      input.fs.writeText(
        page,
        originalPage({ markup, styles, base, frame: CATALOG_BODY_RULE, shell: source.shell }),
      );

      const widths = hasBreakpoint(sheets) ? [DESKTOP, PHONE] : [DESKTOP];
      const here: VerifyIssue[] = [];
      const there: OriginalEntry[] = [];
      let partial: string[] = [];
      try {
        for (const width of widths) {
          const shot = (side: 'copy' | 'original') =>
            join(dir, 'originals', `${key}.${width}.${side}.png`);
          const theirs = await input.measure({
            page,
            search: '',
            width,
            height: HEIGHT,
            shot: shot('original'),
            controls: CONTROLS_MAX,
            probe: { selectors: scan.selectors, declarations: scan.declarations },
          });
          if (theirs.state !== 'measured') throw new Error(theirs.error);
          partial = needsBuild(scan, theirs.unread);
          if (partial.length > 0) break;
          const mine = await input.measure({
            page: build.path,
            search: exampleSearch(key),
            width,
            height: HEIGHT,
            shot: shot('copy'),
            controls: CONTROLS_MAX,
          });
          if (mine.state !== 'measured') throw new Error(mine.error);

          let more = 0;
          const reported: { state: string; diff: OriginalDiff }[] = [];
          if (labels(mine.frames) !== labels(theirs.frames)) {
            const diff = {
              element: 'root',
              property: 'states',
              copy: labels(mine.frames),
              original: labels(theirs.frames),
            };
            reported.push({ state: 'rest', diff });
          }
          for (const [place, copyFrame] of mine.frames.entries()) {
            const originalFrame = theirs.frames[place];
            if (!originalFrame || label(originalFrame) !== label(copyFrame)) continue;
            const layers = compareLayers(copyFrame.facts, originalFrame.facts);
            const outlines = compareOutlines(copyFrame.outlines, originalFrame.outlines);
            const all = [...layers.diffs, ...outlines];
            const kept = all.slice(0, DIFFS_MAX);
            more += layers.more + (all.length - kept.length);
            for (const diff of kept) reported.push({ state: label(copyFrame), diff });
          }
          for (const { state, diff } of reported) {
            here.push({
              step: 'original',
              path: at,
              key: 'kitIssue.originalDiffers',
              params: { key, width, state, ...diff },
            });
          }
          if (more > 0) {
            here.push({
              step: 'original',
              path: at,
              key: 'kitIssue.originalMore',
              params: { key, count: more },
            });
          }
          const score = lookScore(theirs.pixels, mine.pixels);
          if (score.score < ORIGINAL_LINE) {
            here.push({
              step: 'original',
              path: at,
              key: 'kitIssue.originalFar',
              params: {
                key,
                width,
                score: score.score,
                size: score.size,
                colour: score.colour,
                structure: score.structure,
                copy: fromProject(project, shot('copy')),
                original: fromProject(project, shot('original')),
              },
            });
          }
          there.push({
            key,
            width,
            frames: mine.frames.length,
            differences: reported.length + more,
            score: score.score,
          });
        }
      } catch (error) {
        found.push({
          step: 'original',
          path: at,
          key: 'kitIssue.originalUnreadable',
          params: { key, detail: failure(error) },
        });
        continue;
      }
      if (partial.length > 0) {
        found.push({
          step: 'original',
          path: at,
          key: 'kitIssue.originalPartial',
          params: {
            component: component.name,
            count: partial.length,
            detail: partial.slice(0, 3).join(', '),
          },
        });
        why = 'partial';
        break;
      }
      found.push(...here);
      entries.push(...there);
    }

    if (why === undefined) {
      issues.push(...found);
      originals.push(...entries);
    } else {
      // No numbers for a component that was not drawn as the app draws it: only the advice.
      issues.push(...found.filter((issue) => ADVICE.has(issue.key)));
      drawn.push({ component: component.name, why });
    }
  }

  const failed = issues.some((issue) => !ADVICE.has(issue.key));
  return { state: failed ? 'failed' : 'passed', issues, originals, drawn };
}
