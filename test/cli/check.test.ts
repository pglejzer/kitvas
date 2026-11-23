import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../src/checks/adapters/tsc-checker.ts';
import type { Browser } from '../../src/checks/index.ts';
import { createCheckCommand, createDraftCommand, runCli } from '../../src/cli/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { initWorkspace, KitvasError, PLUGIN_ROOT, workspaceDir } from '../../src/shared/index.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { renderTools, writeShopSections } from '../helpers/render.ts';
import { tempDir } from '../helpers/tmp.ts';

/** The fields of `check --json` these tests read. */
type CheckData = {
  summary: { fix: number; review: number };
  findings: { rule: string }[];
  built: boolean;
};

async function harness(browser?: Browser) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  initWorkspace(io.cwd);
  writeFileSync(join(io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  const deps = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
    render: renderTools,
    types: () => createTscChecker({ roots: [PLUGIN_ROOT] }),
    ...(browser ? { browser: () => browser } : {}),
  };
  const commands = [createDraftCommand(deps), createCheckCommand(deps)];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const draftDir = join(io.cwd, '.kitvas', 'drafts', 'shop');
  await run('draft', 'new', 'shop', '--title', 'Shop');
  writeShopSections(draftDir);
  const data = (): CheckData => (JSON.parse(out.at(-1) ?? '') as { data: CheckData }).data;
  return { out, err, run, draftDir, data };
}

test('a clean draft: nothing to fix, the browser checks are not run yet', async () => {
  const h = await harness();
  const results = join(h.draftDir, 'v1', 'build', 'json', 'checks.json');
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(
    h.out.at(-1),
    [
      'Checked "shop" version 1: nothing to fix or review.',
      'Not run: a11y, runtime.',
      `Results: ${results}`,
    ].join('\n'),
  );
});

test('findings are listed with their place, message and hint', async () => {
  const h = await harness();
  writeFileSync(
    join(h.draftDir, 'v1', 'src', 'scss', 'sections', 'hero.scss'),
    '.hero {\n  color: #fff;\n}\n',
  );
  assert.equal(await h.run('check', 'shop'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.equal(lines[0], 'Checked "shop" version 1: 1 to fix, 0 to review.');
  assert.equal(lines[1], '  fix     ds/raw-color  src/scss/sections/hero.scss:2:10');
  assert.equal(lines[2], '          "#fff" is a colour written by hand.');
  assert.equal(lines[3], '          Use a colour token; "kitvas kit css" lists them.');

  assert.equal(await h.run('check', 'shop', '--json'), 0);
  assert.deepEqual(h.data().summary, { fix: 1, review: 0 });
  assert.equal(h.data().findings[0]?.rule, 'ds/raw-color');
  assert.equal(h.data().built, true);
});

test('check needs a slug and an existing draft', async () => {
  const h = await harness();
  assert.equal(await h.run('check', '--json'), 2);
  assert.equal(await h.run('check', 'nope', '--json'), 9);
  const failure = JSON.parse(h.err.at(-1) ?? '') as { error: { code: string } };
  assert.equal(failure.error.code, 'DRAFT_NOT_FOUND');
});

test('with a browser, its findings and screenshots are listed', async () => {
  const browser: Browser = {
    async open() {
      return {
        name: 'fake',
        async visit() {
          return {
            rendered: true,
            console: [],
            pageErrors: [],
            failedRequests: [],
            violations: [
              {
                id: 'image-alt',
                impact: 'critical',
                help: 'Images must have alternative text',
                nodes: [{ element: 'sections/Hero:section/h1', summary: 'Add alt text.' }],
              },
            ],
            usage: [],
            shot: true,
          };
        },
        async close() {},
      };
    },
  };
  const h = await harness(browser);
  const json = join(h.draftDir, 'v1', 'build', 'json');
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(
    h.out.at(-1),
    [
      'Checked "shop" version 1: 1 to fix, 0 to review.',
      '  fix     a11y/image-alt  src/tsx/sections/Hero.tsx:6:7  sections/Hero:section/h1',
      '          Images must have alternative text',
      '          Add alt text.',
      `Screenshots: 2 in ${join(h.draftDir, 'v1', 'build', 'shots')}`,
      `Results: ${join(json, 'checks.json')}`,
    ].join('\n'),
  );
});

test('without a browser on the machine the note says how to get one', async () => {
  const h = await harness({
    async open() {
      throw new KitvasError('BROWSER_MISSING', { dir: 'x' });
    },
  });
  assert.equal(await h.run('check', 'shop'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.deepEqual(lines.slice(0, 3), [
    'Checked "shop" version 1: nothing to fix or review.',
    'Not run: a11y, runtime.',
    'a11y and runtime need Chrome, Edge or Chromium; none was found. Run "kitvas browser install".',
  ]);
});
