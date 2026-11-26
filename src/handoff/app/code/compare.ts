// Use case: `kitvas handoff compare`. The page at the person's address, shot at each width, scored
// against the draft's own check shot (`build/shots/<state>-<width>.png`) with the `look` score. It
// informs and nothing more: no file is changed and no score undoes anything. A width with no check
// shot answers `no-reference` (the skill runs `kitvas check` first); a page that cannot be compared
// answers `blocked`, `missing` or `failed`, never a score.

import { join } from 'node:path';
import {
  type Browser,
  LOOK_LINE,
  lookScore,
  matchPage,
  PIXELS_MAX,
  VIEWPORTS,
} from '../../../checks/index.ts';
import { type DraftStore, latestVersion, loadDraft, versionFolder } from '../../../drafts/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import {
  type Compared,
  type CompareResult,
  comparePassed,
  compareResult,
} from '../../domain/code/compare.ts';

export type CompareDeps = {
  drafts: DraftStore;
  browser: Browser;
  /** All addresses of a host name; rejects when it does not resolve. */
  lookup(host: string): Promise<string[]>;
};

export type CompareInput = {
  slug: string;
  url: string;
  widths: number[];
  /** The region of the page to compare; null: the whole page. */
  selector: string | null;
  /** The draft state whose check shots are the references. */
  state: string;
  allowPrivate: boolean;
};

/** A state id as the drafts module writes it (`states.json`). */
const STATE = /^[a-z][a-z0-9-]{0,62}$/;
const WIDTH_MIN = 200;
const WIDTH_MAX = 4000;
/** The window height for a width the checks have no viewport for. */
const HEIGHT_DEFAULT = 900;

const heightOf = (width: number): number =>
  VIEWPORTS.find((viewport) => viewport.width === width)?.height ?? HEIGHT_DEFAULT;

/** Where the brief of a version is written (task 2): `compare` needs it to exist. */
const briefPath = (folder: string): string => `${folder}/handoff/code/brief.json`;

export async function compareHandoff(deps: CompareDeps, input: CompareInput): Promise<Compared> {
  const { drafts } = deps;
  const { slug } = input;
  const draft = loadDraft(drafts, slug);
  const version = latestVersion(draft);
  const folder = versionFolder(version);
  if (!drafts.exists(slug, briefPath(folder))) {
    throw new KitvasError('HANDOFF_NO_BRIEF', { slug, version });
  }
  if (!STATE.test(input.state)) {
    throw new KitvasError('HANDOFF_INVALID', { at: '--state', reason: input.state });
  }
  const bad = input.widths.find(
    (width) => !Number.isInteger(width) || width < WIDTH_MIN || width > WIDTH_MAX,
  );
  if (bad !== undefined || input.widths.length === 0) {
    throw new KitvasError('HANDOFF_INVALID', { at: '--widths', reason: String(bad ?? '') });
  }

  const dir = drafts.dir(slug);
  const results: CompareResult[] = [];
  for (const width of [...new Set(input.widths)]) {
    const reference = `${folder}/build/shots/${input.state}-${width}.png`;
    if (!drafts.exists(slug, reference)) {
      results.push({ width, state: 'no-reference', detail: reference });
      continue;
    }
    const files = {
      shot: join(dir, folder, 'handoff', 'code', 'shots', `${width}.png`),
      reference: join(dir, ...reference.split('/')),
    };
    const report = await matchPage(deps, {
      url: input.url,
      width,
      height: heightOf(width),
      selector: input.selector,
      shot: files.shot,
      reference: files.reference,
      maxPixels: PIXELS_MAX,
      allowPrivate: input.allowPrivate,
    });
    results.push(compareResult({ width, report, files, line: LOOK_LINE, look: lookScore }));
  }
  return { results, passed: comparePassed(results) };
}
