import assert from 'node:assert/strict';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDraftCommand, createStudioCommand, runCli } from '../../src/cli/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../src/shared/index.ts';
import type { LifecycleDeps } from '../../src/studio/index.ts';
import { fakeLifecycle } from '../helpers/fake-lifecycle.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { SAMPLE_STATE } from '../helpers/studio-state.ts';
import { tempDir } from '../helpers/tmp.ts';

type StartData = {
  draftUrl?: string;
  openUrl?: string;
  fallbackUrl?: string;
  opened?: boolean;
};

/** `browser`: what the fake `openBrowser` answers, as a system without a display answers false. */
function harness(
  lifecycle: LifecycleDeps,
  options: { workspace?: boolean; browser?: boolean } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  if (options.workspace ?? true) {
    initWorkspace(io.cwd);
    writeFileSync(join(io.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\n---\n');
  }
  const projects: string[] = [];
  const served: string[] = [];
  const opened: [string, string][] = [];
  const draftsAt = (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts'));
  const commands = [
    createDraftCommand({ draftsAt, kits: createFolderKitStore(FIXTURE_KITS) }),
    createStudioCommand({
      draftsAt,
      lifecycle: (project) => {
        projects.push(project);
        return lifecycle;
      },
      serve: async (project) => {
        served.push(project);
        return SAMPLE_STATE;
      },
      openBrowser: (url, fallbackUrl) => {
        opened.push([url, fallbackUrl]);
        return options.browser ?? true;
      },
    }),
  ];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const data = (): StartData => (JSON.parse(out.at(-1) ?? '') as { data: StartData }).data;
  return { out, err, io, run, data, projects, served, opened };
}

const STUDIO = 'http://kitvas.localhost:7001';
const LINK = `${STUDIO}/open?code=c0de&to=%2F`;
const FALLBACK = 'http://localhost:7001/open?code=c0de&to=%2F';

/** The text of a start: the address, then the link, its fallback and the bookmark. */
const startText = (head: string, open: string, fallback: string, opened = false): string =>
  [
    head,
    ...(opened ? ['Opened it in your browser.'] : []),
    `Open it with this link, which works once, for 60 seconds: ${open}`,
    `If that address does not open (Safari before macOS 26), use: ${fallback}`,
    `After the first visit, ${STUDIO}/ opens in this browser without a link for 30 days.`,
  ].join('\n');

test('kitvas studio starts the studio of this project and prints its address', async () => {
  const h = harness(fakeLifecycle().deps);
  assert.equal(await h.run('studio'), 0);
  assert.equal(h.out.at(-1), startText(`The studio started at ${STUDIO}/`, LINK, FALLBACK));
  assert.deepEqual(h.projects, [realpathSync.native(h.io.cwd)]);
  assert.equal(await h.run('studio', '--json'), 0);
  assert.deepEqual(h.data(), {
    view: 'start',
    started: false,
    url: STUDIO,
    port: 7001,
    pid: 7001,
    version: '1.0.0',
    draftUrl: null,
    openUrl: LINK,
    fallbackUrl: FALLBACK,
    opened: false,
  });
  // Without --open no browser is started.
  assert.deepEqual(h.opened, []);
});

test('with a draft name the link opens that draft; an unknown draft is an error', async () => {
  const h = harness(fakeLifecycle().deps);
  await h.run('draft', 'new', 'shop', '--title', 'Shop');
  assert.equal(await h.run('studio', 'shop'), 0);
  const link = `${STUDIO}/open?code=c0de&to=%2Fdrafts%2Fshop`;
  const fallback = 'http://localhost:7001/open?code=c0de&to=%2Fdrafts%2Fshop';
  assert.equal(h.out.at(-1), startText(`The studio started at ${STUDIO}/`, link, fallback));
  assert.equal(await h.run('studio', 'start', 'shop', '--json'), 0);
  assert.equal(h.data().draftUrl, `${STUDIO}/drafts/shop`);
  assert.equal(h.data().openUrl, link);
  assert.equal(h.data().fallbackUrl, fallback);
  assert.equal(await h.run('studio', 'nope'), 9);
  assert.equal(await h.run('studio', 'Not_A_Slug'), 2);
});

test('--open opens the one-time link in the browser and still prints it', async () => {
  const h = harness(fakeLifecycle().deps);
  assert.equal(await h.run('studio', '--open'), 0);
  assert.deepEqual(h.opened, [[LINK, FALLBACK]]);
  assert.equal(h.out.at(-1), startText(`The studio started at ${STUDIO}/`, LINK, FALLBACK, true));
  assert.equal(await h.run('studio', 'start', '--open', '--json'), 0);
  assert.equal(h.data().opened, true);
  assert.equal(h.opened.length, 2);
});

test('--open where no browser can be opened leaves the printed links', async () => {
  const h = harness(fakeLifecycle().deps, { browser: false });
  assert.equal(await h.run('studio', '--open', '--json'), 0);
  assert.equal(h.data().opened, false);
  assert.deepEqual(h.opened, [[LINK, FALLBACK]]);
  assert.equal(await h.run('studio', '--open'), 0);
  assert.equal(h.out.at(-1), startText(`The studio runs at ${STUDIO}/`, LINK, FALLBACK));
});

test('an invalid draft name is called invalid, not missing', async () => {
  const h = harness(fakeLifecycle().deps);
  assert.equal(await h.run('studio', 'shop.'), 2);
  assert.match(h.err.at(-1) ?? '', /"shop\." is not a valid draft name/);
  assert.doesNotMatch(h.err.at(-1) ?? '', /needs a draft slug/);
});

test('status and stop', async () => {
  const h = harness(fakeLifecycle({ running: SAMPLE_STATE }).deps);
  const url = `http://kitvas.localhost:${SAMPLE_STATE.port}`;
  assert.equal(await h.run('studio', 'status'), 0);
  assert.equal(
    h.out.at(-1),
    `The studio runs at ${url}/ (kitvas 1.0.0, process ${SAMPLE_STATE.pid}).`,
  );
  assert.equal(await h.run('studio', 'stop'), 0);
  assert.equal(h.out.at(-1), `The studio (process ${SAMPLE_STATE.pid}) stopped.`);
  assert.equal(await h.run('studio', 'stop'), 0);
  assert.equal(h.out.at(-1), 'No studio runs for this project.');
  assert.equal(await h.run('studio', 'status', '--json'), 0);
  assert.deepEqual(h.data(), {
    view: 'status',
    running: false,
    url: null,
    pid: null,
    version: null,
  });
});

test('serve runs the studio of this project', async () => {
  const h = harness(fakeLifecycle().deps);
  assert.equal(await h.run('studio', 'serve'), 0);
  assert.deepEqual(h.served, [realpathSync.native(h.io.cwd)]);
  const url = `http://kitvas.localhost:${SAMPLE_STATE.port}`;
  assert.equal(h.out.at(-1), `The studio at ${url}/ stopped.`);
});

test('without a workspace there is no studio', async () => {
  const h = harness(fakeLifecycle().deps, { workspace: false });
  assert.equal(await h.run('studio'), 13);
});
