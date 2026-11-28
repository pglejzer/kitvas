// Project kits end to end through the real CLI, once per fixture project (an npm package, a folder
// of the project's own components, a shadcn-style Tailwind v4 folder): the learned kit is checked
// and verified, a draft made with it is built and checked, its examples are built, and for one
// fixture the studio shows the kit page.

import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type TestContext, test } from 'node:test';
import type { ChecksReport } from '../../src/checks/index.ts';
import type { BuildView, DraftView, KitView, LayoutView, Status } from '../../src/cli/index.ts';
import { type FixtureName, fixtureDraftDir } from '../helpers/kit/projects.ts';
import { kitvas, type Sandbox } from './helpers/cli.ts';
import { call, iframes, mainTag } from './helpers/http.ts';
import { type FixtureBox, fixtureBox, removeFixtureBox } from './helpers/project-box.ts';
import { killLeftovers, type OpenStudio, startStudio, stopStudio } from './helpers/studio-run.ts';

/** Commands that read or write a few files. */
const QUICK_MS = 30_000;
/** esbuild and Sass over a draft version or over the kit's examples, Tailwind in a child process. */
const BUILD_MS = 120_000;
/** `kit verify`: bundle, tsc, the catalog build and a browser visit of every example. */
const VERIFY_MS = 180_000;
/** A build, tsc, then a browser for the states at two widths. */
const CHECK_MS = 120_000;
/** The whole path of one fixture. */
const TEST_MS = 300_000;

const SLUG = 'demo';
const STEPS = ['schema', 'imports', 'types', 'render', 'tokens'] as const;
/** Steps a kit of real components does not run: `look` and `original` hold only written kits. */
const NOT_RUN = { look: 'skipped', original: 'skipped' } as const;

type CheckView = Extract<KitView, { view: 'check' }>;
type KitBuildView = Extract<KitView, { view: 'build' }>;
/** What `kitvas kit verify --json` answers: the verify file with a view name. */
type VerifyView = {
  view: 'verify';
  kit: string;
  valid: boolean;
  steps: Record<(typeof STEPS)[number], string>;
  issues: { step: string; path: string; key: string; params: Record<string, string | number> }[];
  notes: string[];
};
type UseView = { view: 'use'; id: string };

/** Keys like `Button.1` of every example the fixture's kit.json lists, in catalog order. */
function exampleKeys({ box, fixture }: FixtureBox): string[] {
  const file = join(box.project, '.kitvas', 'kits', fixture.kitId, 'kit.json');
  const kit = JSON.parse(readFileSync(file, 'utf8')) as {
    components: { name: string; examples?: unknown[] }[];
  };
  return kit.components.flatMap((component) =>
    (component.examples ?? []).map((_, index) => `${component.name}.${index + 1}`),
  );
}

async function checkKit(box: Sandbox, kitId: string): Promise<void> {
  const view = await kitvas<CheckView>(box, ['kit', 'check', kitId], QUICK_MS);
  assert.equal(view.valid, true, `kit check ${kitId}: ${JSON.stringify(view.issues)}`);
}

async function verifyKit(box: Sandbox, kitId: string): Promise<void> {
  const view = await kitvas<VerifyView>(box, ['kit', 'verify', kitId], VERIFY_MS);
  const detail = `steps: ${JSON.stringify(view.steps)}\nissues: ${JSON.stringify(view.issues, null, 2)}\nnotes: ${view.notes.join(' ')}`;
  assert.notEqual(
    view.steps.render,
    'skipped',
    `render and tokens were skipped: this machine has no Chrome or Edge, which CI has.\n${detail}`,
  );
  assert.deepEqual(
    view.steps,
    { ...Object.fromEntries(STEPS.map((step) => [step, 'passed'])), ...NOT_RUN },
    `kit verify ${kitId} did not pass.\n${detail}`,
  );
  assert.equal(view.valid, true, detail);
  assert.deepEqual(view.issues, []);
}

async function selectKit(box: Sandbox, kitId: string): Promise<void> {
  const view = await kitvas<UseView>(box, ['kit', 'use', kitId], QUICK_MS);
  assert.equal(view.id, kitId);
  const status = await kitvas<Status>(box, ['status'], QUICK_MS);
  assert.equal(status.kit, kitId);
}

/** A draft made of the fixture's draft/ folder: layout, build and check of version 1. */
async function draftWithKit(
  { box, fixture }: FixtureBox,
  name: FixtureName,
  s: TestContext,
): Promise<string> {
  const created = await kitvas<Extract<DraftView, { view: 'new' }>>(
    box,
    ['draft', 'new', SLUG, '--title', 'Demo'],
    QUICK_MS,
  );
  assert.equal(created.draft.kit.id, fixture.kitId);
  cpSync(fixtureDraftDir(name), join(created.path, 'v1'), { recursive: true });

  const layout = await kitvas<LayoutView>(box, ['layout', SLUG], QUICK_MS);
  assert.equal(layout.valid, true, JSON.stringify(layout.issues));
  assert.deepEqual(
    layout.sections.map((section) => section.written),
    layout.sections.map(() => true),
    JSON.stringify(layout.sections),
  );

  const build = await kitvas<BuildView>(box, ['build', SLUG], BUILD_MS);
  assert.deepEqual(build.errors, []);
  assert.equal(build.built, true);
  assert.ok(existsSync(build.path), build.path);

  const report = await kitvas<ChecksReport>(box, ['check', SLUG], CHECK_MS);
  const notes = report.notes.join(' ');
  assert.notEqual(
    report.checks.a11y,
    'skipped',
    `a11y and runtime were skipped: this machine has no Chrome or Edge, which CI has. ${notes}`,
  );
  assert.deepEqual(
    report.checks,
    { build: 'ran', types: 'ran', ds: 'ran', a11y: 'ran', ui: 'ran', ux: 'ran', runtime: 'ran' },
    `checks: ${JSON.stringify(report.checks)}; notes: ${notes}`,
  );
  const fixes = report.findings.filter((finding) => finding.severity === 'fix');
  assert.equal(fixes.length, 0, `findings to fix:\n${JSON.stringify(fixes, null, 2)}`);
  s.diagnostic(`${name}: checked in ${report.browser}, ${report.summary.review} to review`);
  // checks.json is `<version folder>/build/json/checks.json`.
  return dirname(dirname(dirname(report.path)));
}

/** Tailwind drafts leave the classes that made no CSS; the fixture's draft uses none such. */
function expectNoUnknownClasses(versionDir: string): void {
  const file = join(versionDir, 'build', 'json', 'tailwind.json');
  assert.ok(existsSync(file), `the Tailwind build left no ${file}`);
  const tailwind = JSON.parse(readFileSync(file, 'utf8')) as { unknown: string[] };
  assert.deepEqual(tailwind.unknown, []);
}

async function buildExamples({ box, fixture }: FixtureBox, keys: string[]): Promise<KitBuildView> {
  const built = await kitvas<KitBuildView>(box, ['kit', 'build', fixture.kitId], BUILD_MS);
  assert.deepEqual(built.errors, []);
  assert.equal(built.built, true);
  assert.deepEqual(built.skipped, []);
  assert.deepEqual([...built.shown].sort(), [...keys].sort());
  assert.ok(existsSync(built.path), built.path);
  return built;
}

/** The kit page of the studio: every example has a frame and the catalog is ready. */
async function studioKitPage(open: OpenStudio, kitId: string, shown: string[]): Promise<void> {
  const page = await call(`${open.studio.url}/kit/${kitId}`, { headers: { cookie: open.cookie } });
  assert.equal(page.status, 200, page.text.slice(0, 1_500));
  const main = mainTag(page.text);
  assert.match(main, new RegExp(`\\sdata-kit="${kitId}"`), main);
  assert.match(main, /\sdata-catalog="ready"/, main);
  const examples = iframes(page.text)
    .map((frame) => frame['data-example'])
    .filter((key): key is string => key !== undefined);
  assert.deepEqual([...examples].sort(), [...shown].sort());
}

const FIXTURES: { name: FixtureName; studio: boolean }[] = [
  { name: 'acme-npm', studio: true },
  { name: 'acme-repo', studio: false },
  { name: 'acme-tailwind', studio: false },
];

// A Tailwind 3 kit maps tokens onto theme paths: `theme(colors.primary)` is `hsl(var(--primary))`
// in the project's config and `theme(colors.brand)` a literal colour; `tokens` compares both.
test('project kit acme-tailwind3: check and verify pass all five steps', {
  timeout: TEST_MS,
}, async (t) => {
  const fixtureBoxed = fixtureBox('acme-tailwind3');
  const { box, fixture } = fixtureBoxed;
  let passed = false;
  try {
    await checkKit(box, fixture.kitId);
    await verifyKit(box, fixture.kitId);
    passed = true;
  } finally {
    if (passed) removeFixtureBox(fixtureBoxed);
    else t.diagnostic(`kept for a look: ${box.project} ${box.dataDir}`);
  }
});

for (const { name, studio } of FIXTURES) {
  const title = `project kit ${name}: check, verify, use, a checked draft, examples`;
  test(studio ? `${title}, studio` : title, { timeout: TEST_MS }, async (t) => {
    const fixtureBoxed = fixtureBox(name);
    const { box, fixture } = fixtureBoxed;
    const keys = exampleKeys(fixtureBoxed);
    let open: OpenStudio | undefined;
    let passed = false;
    // A studio of this test must not outlive it, even when the test is cut short.
    const onExit = (): void => killLeftovers(box, open?.studio);
    process.once('exit', onExit);
    try {
      // Each step needs the one before it, so the first failure ends the test.
      await checkKit(box, fixture.kitId);
      await verifyKit(box, fixture.kitId);
      await selectKit(box, fixture.kitId);
      const versionDir = await draftWithKit(fixtureBoxed, name, t);
      if (name === 'acme-tailwind') expectNoUnknownClasses(versionDir);
      const { shown } = await buildExamples(fixtureBoxed, keys);
      if (studio) {
        open = await startStudio(box, SLUG);
        await studioKitPage(open, fixture.kitId, shown);
      }
      passed = true;
    } finally {
      let stopped = !studio;
      if (studio) {
        try {
          await stopStudio(box, open?.studio);
          stopped = true;
        } catch (error) {
          t.diagnostic(`the studio did not stop cleanly: ${String(error)}`);
        }
      }
      if (stopped) process.removeListener('exit', onExit);
      if (passed && stopped) removeFixtureBox(fixtureBoxed);
      else t.diagnostic(`kept for a look: ${box.project} ${box.dataDir}`);
    }
  });
}
