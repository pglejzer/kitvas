// Stage 1 from start to end through the real CLI, each step a child process of `bin/kitvas.ts`:
// init, a draft written the way the compose agents write it, layout, build and check of two
// versions, the rendered examples of the Base kit, then the detached studio over HTTP: the open
// link, the draft page and its frames, a comparison, the API, the kit page and a catalog job.

import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type TestContext, test } from 'node:test';
import type { ChecksReport } from '../../src/checks/index.ts';
import type {
  BuildView,
  DraftView,
  KitView,
  LayoutView,
  Status,
  StudioCommandView,
} from '../../src/cli/index.ts';
import type { Draft, SectionContext } from '../../src/drafts/index.ts';
import type { Job } from '../../src/studio/jobs/job.ts';
import { forceKill, isAlive } from '../../src/studio/run/processes.ts';
import { kitvas, type Sandbox, sandbox, statePids, studioLog, writeText } from './helpers/cli.ts';
import { call, cookieOf, iframes, mainTag, poll, type Reply } from './helpers/http.ts';
import {
  BRIEF,
  HERO_V2,
  kitImports,
  LAYOUT_V1,
  LAYOUT_V2,
  SECTIONS_V1,
  type SectionSource,
  STATE_IDS,
  STATES,
  tokensUsed,
} from './helpers/shop-draft.ts';

/** Commands that read or write a few files. */
const QUICK_MS = 30_000;
/** esbuild and Sass over a draft version or over the kit's examples. */
const BUILD_MS = 90_000;
/** A build, tsc, then a browser for two states at two widths. */
const CHECK_MS = 120_000;
/** Starting or stopping the detached studio, which itself waits up to 15 s and 5 s. */
const STUDIO_MS = 60_000;
/** A catalog job: a cached `kitvas kit build` in a process of its own. */
const JOB_MS = 60_000;
/** The whole path, a little above what CI takes on its slowest machine. */
const TEST_MS = 240_000;

/** What `kitvas kit build` answers, also the result of a catalog job. */
type KitBuildView = Extract<KitView, { view: 'build' }>;
type StudioStart = Extract<StudioCommandView, { view: 'start' }>;
type StudioStop = Extract<StudioCommandView, { view: 'stop' }>;
type StudioStatus = Extract<StudioCommandView, { view: 'status' }>;

/** What later steps need from earlier ones. */
type Live = {
  draftDir: string;
  /** Example keys of the first kit build, in catalog order. */
  shown: string[];
  studio: StudioStart | undefined;
  /** `kitvas_<port>=<secret>`, as `/open` set it. */
  cookie: string;
  /** `http://kitvas.localhost:<frame port>`. */
  frameOrigin: string;
  /** The studio was stopped and checked gone. */
  stopped: boolean;
};

type Step = (s: TestContext) => Promise<void>;

/** Steps run in order; once one fails the later ones are skipped, except those that always run. */
function stepper(t: TestContext) {
  let failed: string | undefined;
  const run = (name: string, body: Step, always: boolean) =>
    t.test(name, async (s) => {
      if (failed !== undefined && !always) {
        s.skip(`"${failed}" failed`);
        return;
      }
      try {
        await body(s);
      } catch (error) {
        failed ??= name;
        throw error;
      }
    });
  return {
    step: (name: string, body: Step) => run(name, body, false),
    always: (name: string, body: Step) => run(name, body, true),
    failed: () => failed,
  };
}

/** Fails unless `reply` has `status`; the message holds the answer and the end of the studio log. */
function expectStatus(box: Sandbox, reply: Reply, status: number, what: string): void {
  if (reply.status === status) return;
  assert.fail(
    `${what}: expected ${status}, got ${reply.status}\n${reply.text.slice(0, 1_500)}\nstudio log:\n${studioLog(box)}`,
  );
}

function expectFile(box: Sandbox, reply: Reply, type: RegExp, what: string): void {
  expectStatus(box, reply, 200, what);
  assert.match(String(reply.headers['content-type']), type, what);
}

function jsonOf<T>(box: Sandbox, reply: Reply, what: string): T {
  expectStatus(box, reply, 200, what);
  return JSON.parse(reply.text) as T;
}

const HTML = /^text\/html/;

async function initProject(box: Sandbox): Promise<void> {
  const init = await kitvas<{ path: string; created: boolean }>(box, ['init'], QUICK_MS);
  assert.equal(init.created, true);
  assert.ok(existsSync(join(init.path, 'decisions.md')), init.path);
  const status = await kitvas<Status>(box, ['status'], QUICK_MS);
  assert.equal(status.kit, 'base');
  assert.equal(status.workspace.exists, true);
}

/** Reads the section's context the way a maker agent does, then writes its two files there. */
async function writeSection(box: Sandbox, section: SectionSource, version: number): Promise<void> {
  const context = await kitvas<SectionContext>(
    box,
    ['context', 'shop', '--section', section.id],
    QUICK_MS,
  );
  assert.equal(context.draft.version, version);
  assert.equal(context.section.component, section.component);
  assert.equal(context.kit.id, 'base');
  assert.deepEqual(
    context.states.states.map((state) => state.id),
    STATE_IDS,
  );
  const offered = context.kit.components.map((component) => component.name);
  for (const name of kitImports(section.tsx)) {
    assert.ok(
      offered.includes(name),
      `${section.id} imports ${name}; it may use ${offered.join()}`,
    );
  }
  for (const token of tokensUsed(section.scss)) {
    assert.ok(
      context.kit.tokens.some((entry) => entry.name === token),
      `${section.id} uses ${token}, not a kit token`,
    );
  }
  writeText(context.files.tsx, section.tsx);
  writeText(context.files.scss, section.scss);
}

async function writeDraft(box: Sandbox, live: Live): Promise<void> {
  const created = await kitvas<Extract<DraftView, { view: 'new' }>>(
    box,
    ['draft', 'new', 'shop', '--title', 'Shop'],
    QUICK_MS,
  );
  assert.equal(created.draft.slug, 'shop');
  assert.equal(created.draft.title, 'Shop');
  assert.equal(created.draft.kit.id, 'base');
  assert.deepEqual(
    created.draft.versions.map((entry) => entry.number),
    [1],
  );
  live.draftDir = created.path;
  writeText(join(created.path, 'v1', 'md', 'brief.md'), BRIEF);
  writeText(join(created.path, 'v1', 'md', 'layout.md'), LAYOUT_V1);
  writeText(join(created.path, 'v1', 'src', 'json', 'states.json'), STATES);

  const layout = await kitvas<LayoutView>(box, ['layout', 'shop'], QUICK_MS);
  assert.equal(layout.valid, true, JSON.stringify(layout.issues));
  assert.deepEqual(
    layout.sections.map((section) => [section.id, section.component, section.written]),
    [
      ['hero', 'Hero', false],
      ['orders', 'Orders', false],
    ],
  );
  assert.deepEqual(layout.generated, ['v1/src/tsx/index.tsx', 'v1/src/scss/index.scss']);
  for (const section of SECTIONS_V1) await writeSection(box, section, 1);
}

/** `kitvas layout`, `build` and `check` of the latest version: all five checks ran, none to fix. */
async function buildAndCheck(box: Sandbox, version: number, s: TestContext): Promise<void> {
  const layout = await kitvas<LayoutView>(box, ['layout', 'shop'], QUICK_MS);
  assert.equal(layout.version, version);
  assert.equal(layout.valid, true, JSON.stringify(layout.issues));
  assert.deepEqual(
    layout.sections.map((section) => [section.id, section.written]),
    [
      ['hero', true],
      ['orders', true],
    ],
  );

  const build = await kitvas<BuildView>(box, ['build', 'shop'], BUILD_MS);
  assert.equal(build.version, version);
  assert.deepEqual(build.errors, []);
  assert.equal(build.built, true);
  assert.equal(build.cached, false);
  assert.deepEqual(build.warnings, []);
  assert.ok(existsSync(build.path), build.path);

  const report = await kitvas<ChecksReport>(box, ['check', 'shop'], CHECK_MS);
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
  assert.equal(report.version, version);
  assert.equal(report.built, true);
  const fixes = report.findings.filter((finding) => finding.severity === 'fix');
  assert.equal(
    fixes.length,
    0,
    `version ${version} has findings to fix:\n${JSON.stringify(fixes, null, 2)}`,
  );
  assert.equal(report.summary.fix, 0);

  const shots = STATE_IDS.flatMap((state) =>
    [390, 1280].map((width) => `build/shots/${state}-${width}.png`),
  );
  assert.deepEqual(
    report.shots.map((shot) => shot.file),
    shots,
  );
  // checks.json is `<version folder>/build/json/checks.json`; shots are relative to the version.
  const versionDir = dirname(dirname(dirname(report.path)));
  for (const shot of report.shots) {
    const file = join(versionDir, ...shot.file.split('/'));
    assert.ok(existsSync(file), file);
  }
  s.diagnostic(
    `version ${version}: checked in ${report.browser}, ${report.summary.review} to review`,
  );
}

async function secondVersion(box: Sandbox, live: Live, s: TestContext): Promise<void> {
  const next = await kitvas<Extract<DraftView, { view: 'version' }>>(
    box,
    ['draft', 'version', 'shop'],
    QUICK_MS,
  );
  assert.deepEqual(next, { view: 'version', slug: 'shop', version: 2 });
  // The hero gets a new title and text, and a Badge in place of its second button.
  writeText(join(live.draftDir, 'v2', 'md', 'layout.md'), LAYOUT_V2);
  await writeSection(box, HERO_V2, 2);
  await buildAndCheck(box, 2, s);
}

async function buildKit(box: Sandbox, live: Live): Promise<void> {
  const first = await kitvas<KitBuildView>(box, ['kit', 'build', 'base'], BUILD_MS);
  assert.equal(first.view, 'build');
  assert.equal(first.id, 'base');
  assert.deepEqual(first.errors, []);
  assert.equal(first.built, true);
  assert.equal(first.cached, false);
  const keys = `shown: ${first.shown.join(', ')}; skipped: ${first.skipped.join(', ')}`;
  assert.ok(first.shown.length >= 12, keys);
  assert.ok(first.shown.includes('Button.1'), keys);
  assert.ok(existsSync(first.path), first.path);
  live.shown = first.shown;

  const second = await kitvas<KitBuildView>(box, ['kit', 'build', 'base'], BUILD_MS);
  assert.equal(second.built, true);
  assert.equal(second.cached, true);
  assert.deepEqual(second.shown, first.shown);
  assert.deepEqual(second.skipped, first.skipped);
  assert.equal(second.path, first.path);
}

/** The studio as a browser meets it: the one-time link, the draft page, its frames, the API. */
async function studioDraft(box: Sandbox, live: Live): Promise<void> {
  const started = await kitvas<StudioStart>(box, ['studio', 'shop'], STUDIO_MS);
  live.studio = started;
  assert.equal(started.view, 'start');
  assert.equal(started.started, true);
  const draftUrl = `${started.url}/drafts/shop`;
  assert.equal(started.draftUrl, draftUrl);

  // A browser opening the printed link: no Fetch Metadata, the 303 itself, the page cookie.
  const opened = await call(started.openUrl);
  expectStatus(box, opened, 303, 'GET the open link');
  assert.equal(opened.headers.location, '/drafts/shop');
  live.cookie = cookieOf(opened);
  assert.match(live.cookie, new RegExp(`^kitvas_${started.port}=[^;\\s]+$`));
  const headers = { cookie: live.cookie };

  const status = jsonOf<{ name: string; framePort: number }>(
    box,
    await call(`${started.url}/api/v1/status`, { headers }),
    'GET /api/v1/status',
  );
  assert.equal(status.name, 'kitvas');
  // The pages frame the prototype origin on the name they were opened on: `kitvas.localhost`.
  live.frameOrigin = `http://${new URL(started.url).hostname}:${status.framePort}`;

  const page = await call(draftUrl, { headers });
  expectFile(box, page, HTML, 'GET /drafts/shop');
  const frames = iframes(page.text);
  assert.equal(frames.length, 1, page.text.slice(0, 1_500));
  const src = frames[0]?.src ?? '';
  assert.ok(src.startsWith(`${live.frameOrigin}/f/`), src);
  const frame = await call(src);
  expectFile(box, frame, HTML, `GET ${src}`);
  assert.match(frame.text, /<div id="root"><\/div>/);

  const compared = await call(`${started.url}/drafts/shop?version=2&compare=1`, { headers });
  expectFile(box, compared, HTML, 'GET /drafts/shop?version=2&compare=1');
  const main = mainTag(compared.text);
  assert.match(main, /\sdata-version="2"/, main);
  assert.match(main, /\sdata-compare="1"/, main);
  const panes = iframes(compared.text);
  assert.deepEqual(
    panes.map((pane) => pane['data-frame']),
    ['before', 'current'],
  );
  for (const pane of panes) {
    const address = pane.src ?? '';
    assert.ok(address.startsWith(`${live.frameOrigin}/f/`), address);
    expectFile(box, await call(address), HTML, `GET ${address}`);
  }

  const draft = jsonOf<Draft>(
    box,
    await call(`${started.url}/api/v1/drafts/shop`, { headers }),
    'GET /api/v1/drafts/shop',
  );
  assert.deepEqual(
    draft.versions.map((entry) => entry.number),
    [1, 2],
  );
}

/** The kit page with its example frames (contract 8), then a catalog job that finds it cached. */
async function studioKit(box: Sandbox, live: Live): Promise<void> {
  const studio = live.studio;
  assert.ok(studio, 'the studio did not start');
  const headers = { cookie: live.cookie };

  const page = await call(`${studio.url}/kit/base`, { headers });
  expectFile(box, page, HTML, 'GET /kit/base');
  const main = mainTag(page.text);
  assert.match(main, /\sdata-kit="base"/, main);
  assert.match(main, /\sdata-catalog="ready"/, main);
  const examples = iframes(page.text).filter((frame) => frame['data-example'] !== undefined);
  assert.deepEqual(examples.map((frame) => frame['data-example']).sort(), [...live.shown].sort());

  const button = examples.find((frame) => frame['data-example'] === 'Button.1');
  assert.ok(button, 'the kit page has no frame for Button.1');
  const address = new URL(button.src ?? '');
  assert.equal(address.origin, live.frameOrigin);
  assert.match(address.pathname, /^\/k\/[^/]+\/base\/html\/index\.html$/);
  assert.equal(address.searchParams.get('example'), 'Button.1');
  const channel = button['data-channel'] ?? '';
  assert.ok(channel !== '' && address.hash.startsWith(`#kitvas=${channel}&`), String(button.src));
  assert.equal(button.sandbox, 'allow-scripts');
  expectFile(box, await call(address.href), HTML, `GET ${address.pathname}`);
  const bundle = new URL('../js/index.js', address);
  expectFile(box, await call(bundle.href), /^text\/javascript/, `GET ${bundle.pathname}`);

  const start = await call(`${studio.url}/api/v1/kits/base/catalog`, {
    method: 'POST',
    headers: { ...headers, origin: studio.url, 'content-type': 'application/json' },
    body: '{}',
  });
  expectStatus(box, start, 202, 'POST /api/v1/kits/base/catalog');
  const job = JSON.parse(start.text) as Job;
  assert.equal(job.kind, 'catalog');
  assert.equal(job.slug, 'base');
  assert.equal(start.headers.location, `/api/v1/jobs/${job.id}`);

  const ended = await poll(async () => {
    const current = jsonOf<Job>(
      box,
      await call(`${studio.url}/api/v1/jobs/${job.id}`, { headers }),
      `GET /api/v1/jobs/${job.id}`,
    );
    return current.state === 'running' ? undefined : current;
  }, JOB_MS);
  assert.equal(
    ended.state,
    'succeeded',
    `${JSON.stringify(ended.error)}\nstudio log:\n${studioLog(box)}`,
  );
  const result = ended.result as KitBuildView;
  assert.equal(result.built, true);
  assert.equal(result.cached, true);
  assert.deepEqual(result.shown, live.shown);
}

/** Ends what this test started: through the CLI first, by force only for what the CLI left. */
function killLeftovers(box: Sandbox, live: Live): void {
  const pids = new Set([...(live.studio ? [live.studio.pid] : []), ...statePids(box)]);
  for (const pid of pids) if (isAlive(pid)) forceKill(pid);
}

async function stopStudio(box: Sandbox, live: Live): Promise<void> {
  try {
    const stop = await kitvas<StudioStop>(box, ['studio', 'stop'], STUDIO_MS);
    assert.equal(stop.view, 'stop');
    const studio = live.studio;
    if (studio) {
      assert.equal(stop.stopped, true);
      assert.equal(stop.pid, studio.pid);
      await poll(async () => (isAlive(studio.pid) ? undefined : true), 10_000).catch(() =>
        assert.fail(`the studio (pid ${studio.pid}) still runs after kitvas studio stop`),
      );
    }
    const status = await kitvas<StudioStatus>(box, ['studio', 'status'], QUICK_MS);
    assert.equal(status.view, 'status');
    assert.equal(status.running, false);
    live.stopped = true;
  } finally {
    if (!live.stopped) killLeftovers(box, live);
  }
}

/** Temp folders of a passing run; a failing run keeps them for a look. */
function cleanUp(box: Sandbox): void {
  for (const dir of [box.project, box.dataDir]) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // A file still in use; the system's temp folder is cleaned anyway.
    }
  }
}

test('stage 1 end to end: init, a draft, two checked versions, kit examples, the studio', {
  timeout: TEST_MS,
}, async (t) => {
  const box = sandbox();
  const live: Live = {
    draftDir: '',
    shown: [],
    studio: undefined,
    cookie: '',
    frameOrigin: '',
    stopped: false,
  };
  // A studio of this test must not outlive it, even when the test is cut short.
  const onExit = (): void => {
    if (!live.stopped) killLeftovers(box, live);
  };
  process.once('exit', onExit);
  const { step, always, failed } = stepper(t);
  try {
    await step('init: a workspace whose kit is Base', () => initProject(box));
    await step('draft: brief, layout, two states, both sections from their context', () =>
      writeDraft(box, live),
    );
    await step('version 1: layout, build and check are clean', (s) => buildAndCheck(box, 1, s));
    await step('version 2: one section changed, built and checked clean', (s) =>
      secondVersion(box, live, s),
    );
    await step('kit build: the examples of Base, then the same build cached', () =>
      buildKit(box, live),
    );
    await step('studio: open link, draft page, frames, comparison, draft API', () =>
      studioDraft(box, live),
    );
    await step('studio: kit page, example frame, catalog job', () => studioKit(box, live));
  } finally {
    await always('studio stop: nothing is left running', () => stopStudio(box, live));
    // Kept when the stop did not finish, so the exit of this process still ends the studio.
    if (live.stopped) process.removeListener('exit', onExit);
    if (failed() === undefined && live.stopped) cleanUp(box);
    else t.diagnostic(`kept for a look: ${box.project} ${box.dataDir}`);
  }
});
