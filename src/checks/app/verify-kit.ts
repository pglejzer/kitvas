// Use case: `kitvas kit verify`. Six steps hold a kit against the design system it describes;
// the answer is also left in the kit's catalog folder for the studio.

import { join } from 'node:path';
import { serializeJson } from '../../drafts/index.ts';
import type { KitStore, KitWriter, LoadedKit, ProjectFiles } from '../../kit/index.ts';
import {
  type BuildFs,
  type Bundler,
  buildCatalog,
  type StylePipeline,
  type UtilityCss,
} from '../../render/index.ts';
import { catalogDir, KitvasError } from '../../shared/index.ts';
import {
  type LookEntry,
  VERIFY_FILE,
  type VerifyFile,
  type VerifyIssue,
} from '../domain/kit/kit-verify.ts';
import type { Browser } from '../ports/browser.ts';
import type { TypeChecker } from '../ports/type-checker.ts';
import { type ParsedExample, parseExamples } from './verify/example-parse.ts';
import { importsStep } from './verify/imports.ts';
import { isWritten, lookStep } from './verify/look.ts';
import { renderStep } from './verify/render.ts';
import { schemaStep } from './verify/schema.ts';
import { SKIPPED, type StepResult } from './verify/step.ts';
import { mappedVariables, tokensStep } from './verify/tokens.ts';
import { typesStep } from './verify/types.ts';

export type VerifyDeps = {
  kits: KitStore;
  kitWriter: KitWriter;
  /** The disk of a project, for the paths and packages a project kit names. */
  projectFiles(project: string): ProjectFiles;
  /** The same tools `kitvas build` gets, passed on to the catalog build. */
  render: {
    bundler: Bundler;
    styles: StylePipeline;
    fs: BuildFs;
    runtimeFiles: string[];
    utility: UtilityCss;
  };
  types: TypeChecker;
  /** Without one, `render`, `tokens` and `look` are skipped with a note. */
  browser?: Browser | undefined;
  now(): Date;
};

type PageSteps = {
  render: StepResult;
  tokens: StepResult;
  look: StepResult & { look?: LookEntry[] };
  notes: string[];
};

const NO_BROWSER: PageSteps = {
  render: SKIPPED,
  tokens: SKIPPED,
  look: SKIPPED,
  notes: ['kits.verify.noBrowser'],
};

type PageInput = {
  loaded: LoadedKit;
  kitId: string;
  dir: string;
  examples: ParsedExample[];
  /** Keys of the examples `types` reported. */
  reported: ReadonlySet<string>;
};

/** `render`, `tokens` and `look`: one catalog build and one browser for both, closed whatever happens. */
async function pageSteps(deps: VerifyDeps, input: PageInput): Promise<PageSteps> {
  const { loaded, kitId, dir, examples, reported } = input;
  if (!deps.browser) return NO_BROWSER;
  let session: Awaited<ReturnType<Browser['open']>>;
  try {
    session = await deps.browser.open();
  } catch (error) {
    if (!(error instanceof KitvasError && error.code === 'BROWSER_MISSING')) throw error;
    return NO_BROWSER;
  }
  try {
    if (!session.inspect) return NO_BROWSER;
    const inspect = session.inspect.bind(session);
    // The probe makes a Tailwind build define the mapped variables even when no class uses them.
    const build = await buildCatalog(
      { kits: deps.kits, ...deps.render, kitWriter: deps.kitWriter },
      kitId,
      dir,
      { probe: mappedVariables(loaded) },
    );
    const { bundler } = deps.render;
    const render = await renderStep({ build, dir, examples, reported, inspect, bundler });
    const tokens = await tokensStep({ loaded, build, inspect });
    // Each skipped step names its reason once.
    const notes: string[] = [];
    if (tokens.state === 'skipped') {
      notes.push(
        loaded.kit.tokens.cssVars === undefined || mappedVariables(loaded).length === 0
          ? 'kits.verify.noTokenMap'
          : 'kits.verify.noPage',
      );
    }
    if (!isWritten(loaded)) {
      return { render, tokens, look: SKIPPED, notes: [...notes, 'kits.verify.notWritten'] };
    }
    // A written kit is held to its references; a browser that cannot capture says so.
    const { capture } = session;
    if (!capture) {
      return { render, tokens, look: SKIPPED, notes: [...notes, 'kits.verify.noBrowser'] };
    }
    // The adapter writes the screenshots here; the folder has to exist.
    deps.render.fs.writeText(join(dir, 'look', '.gitkeep'), '');
    const look = await lookStep({
      loaded,
      build,
      dir,
      examples,
      capture: (input) => capture.call(session, input),
    });
    return { render, tokens, look, notes };
  } finally {
    await session.close();
  }
}

/** One problem met by two steps (a module that does not resolve) is listed where it came first. */
function withoutRepeats(issues: VerifyIssue[]): VerifyIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const id = JSON.stringify([issue.path, issue.key, issue.params]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const exampleKeys = (issues: VerifyIssue[]): Set<string> =>
  new Set(
    issues
      .filter((issue) => issue.key === 'kitIssue.exampleRejected')
      .map((issue) => String(issue.params.key)),
  );

/**
 * Runs the six steps, writes verify.json into `catalogDir(project, kitId)` and returns it.
 * A kit that is not there throws `KIT_NOT_FOUND`; everything else is in the answer.
 */
export async function verifyKit(
  deps: VerifyDeps,
  kitId: string,
  project: string,
): Promise<VerifyFile> {
  const { fs, bundler } = deps.render;
  const schema = schemaStep(deps, kitId);
  const dir = catalogDir(project, kitId);
  let imports = SKIPPED;
  let types = SKIPPED;
  // The steps after `schema` are not run for a kit that failed it; the issues say why.
  let page: PageSteps = {
    render: SKIPPED,
    tokens: SKIPPED,
    look: SKIPPED,
    notes: ['kits.verify.afterSchema'],
  };

  const { loaded } = schema;
  if (loaded && schema.state === 'passed') {
    // The bundler and tsc are given the folder as their working directory: it has to exist.
    if (!fs.exists(dir)) fs.writeText(join(dir, 'build', 'json', '.gitkeep'), '');
    const examples = await parseExamples(bundler, loaded.kit);
    imports = await importsStep({ loaded, dir, bundler });
    types = await typesStep({ loaded, dir, examples, types: deps.types, bundler, fs });
    page = await pageSteps(deps, {
      loaded,
      kitId,
      dir,
      examples,
      reported: exampleKeys(types.issues),
    });
  }

  const steps = {
    schema: schema.state,
    imports: imports.state,
    types: types.state,
    render: page.render.state,
    tokens: page.tokens.state,
    look: page.look.state,
  };
  const scores = page.look.look ?? [];
  const file: VerifyFile = {
    schemaVersion: 2,
    kit: kitId,
    // No hash without a readable kit.json: any later hash differs, so the studio asks again.
    hash: loaded?.hash ?? '',
    at: deps.now().toISOString(),
    valid: !Object.values(steps).includes('failed'),
    steps,
    issues: withoutRepeats([
      ...schema.issues,
      ...imports.issues,
      ...types.issues,
      ...page.render.issues,
      ...page.tokens.issues,
      ...page.look.issues,
    ]),
    notes: page.notes,
    // Only a run that scored something leaves scores: the file of a kit without references has none.
    ...(page.look.state === 'skipped' ? {} : { look: scores }),
  };
  fs.writeText(join(dir, VERIFY_FILE), serializeJson(file));
  return file;
}
