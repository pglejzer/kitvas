// Use case: `kitvas rework new`. Starts a rework draft and captures its original into `before/`
// (ADR 0045): a live page surveyed at the phone and laptop widths, with its inventory and the
// problems the visit rules find on it, or the person's images, which the skill reads later.

import { join } from 'node:path';
import { createDraft, type Draft, type DraftStore, isSlug } from '../../drafts/index.ts';
import {
  IMAGE_BYTES_MAX,
  IMAGES_MAX,
  imageType,
  type KitStore,
  requireKit,
  WEB_URL,
} from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import { scanPolicy } from '../domain/addresses.ts';
import { BEFORE_DIR } from '../domain/before.ts';
import type { PageFacts } from '../domain/facts.ts';
import type { RawFinding } from '../domain/finding.ts';
import { UI_NO_VIEWPORT } from '../domain/guidelines/rework.ts';
import { VIEWPORTS } from '../domain/page.ts';
import type { VisitInput } from '../domain/rules/index.ts';
import type { Browser, SurveyReport } from '../ports/browser.ts';
import { problemsOf, uncappedFindings, writeBefore } from './before.ts';

export type StartReworkDeps = {
  drafts: DraftStore;
  kits: KitStore;
  browser: Browser;
  /** All addresses of a host name; rejects when it does not resolve. */
  lookup(host: string): Promise<string[]>;
  /** The bytes of a file; `undefined` when it cannot be read. */
  readFile(path: string): Uint8Array | undefined;
  /** Writes a binary file at an absolute path, creating folders. */
  writeFile(path: string, bytes: Uint8Array): void;
  /** Removes a folder and everything in it; nothing when it is missing. */
  remove(path: string): void;
  now(): Date;
  t: Translate;
};

/** Where the original comes from. Paths are absolute. */
export type ReworkSourceInput =
  | { type: 'url'; url: string; allowPrivate: boolean }
  | { type: 'image'; images: string[] }
  /** The PNG the skill saved of a Figma frame, and its structure note. */
  | { type: 'figma'; image: string; note: string };

export type StartReworkInput = {
  slug: string;
  title: string;
  /** The kit the draft is made with: the project's, or the one `--kit` names. */
  kit: string;
  source: ReworkSourceInput;
};

export type StartReworkResult = {
  draft: Draft;
  /** Absolute folder of the draft. */
  path: string;
  before: {
    /** A live page was measured, so the original has a problems list. */
    measured: boolean;
    /** Findings on the original, at both widths. */
    problems: number;
    /** Items of the inventory; 0 for images until the skill writes it. */
    inventory: number;
  };
};

type Image = { name: string; bytes: Uint8Array };
type Surveyed = { width: number; report: Extract<SurveyReport, { state: 'surveyed' }> };

/** What is captured once the draft exists; everything in it was read and checked before. */
type Capture =
  | { type: 'url'; url: string; allowPrivate: boolean }
  | { type: 'image' | 'figma'; images: Image[]; note: string | null };

const EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
const [PHONE] = VIEWPORTS;
/** A live page shows its content: it is taken as the baseline state a draft calls `filled`. */
const SURVEY_STATE = 'filled';

const usage = (deps: StartReworkDeps, key: string, params: Record<string, string | number>) =>
  new KitvasError('USAGE', { detail: deps.t(key, params) });

/** Reads and checks the images before anything is written; names them `1.png`, `2.jpg`, … */
function readImages(deps: StartReworkDeps, paths: string[]): Image[] {
  if (paths.length > IMAGES_MAX) throw usage(deps, 'rework.new.tooMany', { max: IMAGES_MAX });
  return paths.map((path, index) => {
    const bytes = deps.readFile(path);
    const type = bytes ? imageType(bytes) : undefined;
    if (!bytes || !type || bytes.length > IMAGE_BYTES_MAX) {
      throw usage(deps, 'rework.new.badImage', { file: path });
    }
    return { name: `${index + 1}.${EXTENSIONS[type]}`, bytes };
  });
}

/** The note as UTF-8 text; a file that is missing or not text is a usage error. */
function readNote(deps: StartReworkDeps, path: string): string {
  const bytes = deps.readFile(path);
  try {
    if (bytes !== undefined) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8: refused below like a missing file.
  }
  throw usage(deps, 'rework.new.badNote', { file: path });
}

function prepare(deps: StartReworkDeps, source: ReworkSourceInput): Capture {
  switch (source.type) {
    case 'url':
      if (!WEB_URL.test(source.url)) throw usage(deps, 'rework.new.badUrl', { url: source.url });
      return source;
    case 'image':
      if (source.images.length === 0) throw usage(deps, 'rework.usage.source', {});
      return { type: 'image', images: readImages(deps, source.images), note: null };
    case 'figma':
      return {
        type: 'figma',
        images: readImages(deps, [source.image]),
        note: readNote(deps, source.note),
      };
  }
}

/** One survey as a visit of the rules: the baseline state, no element ids, no kit components. */
export function surveyVisit(facts: PageFacts, width: number): VisitInput {
  return {
    facts,
    report: {
      rendered: true,
      console: [],
      pageErrors: [],
      failedRequests: [],
      violations: [],
      usage: [],
      shot: true,
      facts,
      deep: null,
      contrastUnsure: [],
      craft: null,
    },
    seen: { state: SURVEY_STATE, width, ids: [], components: new Map() },
    catalog: [],
    screen: null,
    stateKind: 'baseline',
  };
}

const noViewport = (width: number): RawFinding => ({
  check: UI_NO_VIEWPORT.check,
  rule: UI_NO_VIEWPORT.id,
  severity: UI_NO_VIEWPORT.severity,
  file: null,
  line: 0,
  column: 0,
  element: null,
  message: { key: `checkRule.${UI_NO_VIEWPORT.key}`, params: {} },
  hint: { key: `checkHint.${UI_NO_VIEWPORT.key}`, params: {} },
  states: [SURVEY_STATE],
  widths: [width],
});

/**
 * Every visit rule's findings on each survey, uncapped. Without a viewport meta a phone lays the
 * page out about 980 px wide and shrinks it, so the phone survey's findings would describe that
 * layout: there the one problem is `ui/no-viewport`.
 */
export function originalProblems(surveyed: Surveyed[]): RawFinding[] {
  return surveyed.flatMap(({ width, report }) =>
    !report.viewportMeta && width === PHONE.width
      ? [noViewport(width)]
      : uncappedFindings([surveyVisit(report.facts, width)]),
  );
}

/** The page at both widths in one browser, closed whatever happens. Shots go to `before/shots/`. */
async function surveyAll(
  deps: StartReworkDeps,
  slug: string,
  url: string,
  allowPrivate: boolean,
): Promise<Surveyed[]> {
  const policy = scanPolicy(deps.lookup, allowPrivate);
  const shots = join(deps.drafts.dir(slug), BEFORE_DIR, 'shots');
  const surveyed: Surveyed[] = [];
  const session = await deps.browser.open();
  try {
    const { survey } = session;
    if (!survey) throw new KitvasError('BROWSER_MISSING');
    for (const { width, height } of VIEWPORTS) {
      const shot = join(shots, `${width}.png`);
      const report = await survey.call(session, { url, width, height, shot, policy });
      if (report.state === 'blocked') throw new KitvasError('SCAN_BLOCKED', { url: report.url });
      if (report.state === 'failed') {
        throw new KitvasError('SCAN_FAILED', { url, detail: report.error });
      }
      surveyed.push({ width, report });
    }
  } finally {
    await session.close();
  }
  return surveyed;
}

async function capture(
  deps: StartReworkDeps,
  slug: string,
  plan: Capture,
): Promise<StartReworkResult['before']> {
  const capturedAt = deps.now().toISOString();
  if (plan.type === 'url') {
    const surveyed = await surveyAll(deps, slug, plan.url, plan.allowPrivate);
    const items = surveyed.flatMap(({ report }) => report.inventory);
    const problems = problemsOf(originalProblems(surveyed));
    writeBefore(deps.drafts, slug, {
      source: {
        schemaVersion: 1,
        source: 'url',
        url: plan.url,
        files: [],
        capturedAt,
        widths: surveyed.map(({ width }) => width),
        measured: true,
      },
      inventory: { items },
      problems,
    });
    return { measured: true, problems: problems.findings.length, inventory: items.length };
  }
  const images = join(deps.drafts.dir(slug), BEFORE_DIR, 'images');
  for (const image of plan.images) deps.writeFile(join(images, image.name), image.bytes);
  if (plan.note !== null) deps.drafts.writeText(slug, `${BEFORE_DIR}/note.md`, plan.note);
  writeBefore(deps.drafts, slug, {
    source: {
      schemaVersion: 1,
      source: plan.type,
      url: null,
      files: plan.images.map((image) => image.name),
      capturedAt,
      widths: [],
      measured: false,
    },
    // The skill reads the images and writes the inventory.
    inventory: { items: [] },
  });
  return { measured: false, problems: 0, inventory: 0 };
}

/**
 * Creates the rework draft and captures its original. The source is read and checked first; a
 * page the policy refuses is `SCAN_BLOCKED`, one that does not load is `SCAN_FAILED`, and a
 * capture that fails removes the draft it had just created.
 */
export async function startRework(
  deps: StartReworkDeps,
  input: StartReworkInput,
): Promise<StartReworkResult> {
  const { slug } = input;
  if (!isSlug(slug)) throw new KitvasError('DRAFT_INVALID', { slug, detail: 'slug' });
  if (deps.drafts.exists(slug)) throw new KitvasError('DRAFT_EXISTS', { slug });
  const plan = prepare(deps, input.source);
  const loaded = requireKit(deps.kits, input.kit);

  const draft = createDraft(deps.drafts, {
    slug,
    title: input.title,
    kit: { id: loaded.kit.id, version: loaded.kit.version, hash: loaded.hash },
    now: deps.now(),
    kind: 'rework',
    rework: { source: input.source.type },
  });
  const path = deps.drafts.dir(slug);
  try {
    return { draft, path, before: await capture(deps, slug, plan) };
  } catch (error) {
    // A rework without its original is no rework: nothing is left behind.
    deps.remove(path);
    throw error;
  }
}
