import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import type { Browser } from '../../../src/checks/index.ts';
import { createCheckCommand, createDraftCommand, runCli } from '../../../src/cli/index.ts';
import { createFsDraftStore } from '../../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import {
  initWorkspace,
  KitvasError,
  PLUGIN_ROOT,
  workspaceDir,
} from '../../../src/shared/index.ts';
import { fakeBrowser } from '../../helpers/draft/checks.ts';
import { renderTools, writeShopSections } from '../../helpers/draft/render.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';

/** The fields of `check --json` these tests read. */
type CheckData = {
  summary: { fix: number; review: number; waived?: number };
  findings: { rule: string; options: { id: string; value: string }[] }[];
  waived?: { rule: string; reason: string }[];
  built: boolean;
  deep?: boolean;
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
  writeFileSync(join(io.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\n---\n');
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
  return { out, err, run, draftDir, data, cwd: io.cwd };
}

test('a clean draft: nothing to fix, the browser checks are not run yet', async () => {
  const h = await harness();
  const results = join(h.draftDir, 'v1', 'build', 'json', 'checks.json');
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(
    h.out.at(-1),
    [
      'Checked "shop" version 1: nothing to fix or review.',
      'Not run: a11y, ui, ux, runtime.',
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

test('an accepted finding is listed as accepted, counted apart and not left to fix', async () => {
  const h = await harness();
  writeFileSync(
    join(h.draftDir, 'v1', 'src', 'scss', 'sections', 'hero.scss'),
    '.hero {\n  color: #fff;\n}\n',
  );
  writeFileSync(
    join(h.draftDir, 'waivers.json'),
    JSON.stringify({
      schemaVersion: 1,
      waivers: [
        {
          rule: 'ds/raw-color',
          element: null,
          reason: 'brand white',
          version: 1,
          at: '2026-11-24T10:00:00.000Z',
        },
      ],
    }),
  );
  assert.equal(await h.run('check', 'shop'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.equal(lines[0], 'Checked "shop" version 1: nothing to fix or review.');
  assert.equal(lines[1], 'Accepted on purpose (1):');
  assert.equal(lines[2], '    ds/raw-color  src/scss/sections/hero.scss:2:10');
  assert.equal(lines[3], '          "#fff" is a colour written by hand.');
  assert.equal(lines[4], '          Reason: brand white');

  assert.equal(await h.run('check', 'shop', '--json'), 0);
  assert.deepEqual(h.data().summary, { fix: 0, review: 0, waived: 1 });
  assert.deepEqual(h.data().findings, []);
  assert.deepEqual(
    h.data().waived?.map((one) => [one.rule, one.reason]),
    [['ds/raw-color', 'brand white']],
  );
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
            facts: null,
            deep: null,
            contrastUnsure: [],
            craft: null,
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
    'Not run: a11y, ui, ux, runtime.',
    'a11y, ui, ux and runtime need Chrome, Edge or Chromium; none was found. Run "kitvas browser install".',
  ]);
});

/** checks.json of the shop's version 1 as written. */
const savedDeep = (draftDir: string): unknown =>
  (
    JSON.parse(readFileSync(join(draftDir, 'v1', 'build', 'json', 'checks.json'), 'utf8')) as {
      deep?: unknown;
    }
  ).deep;

test('--deep visits the deep widths too, writes deep: true and says so', async () => {
  const fake = fakeBrowser();
  const h = await harness(fake.browser);
  assert.equal(await h.run('check', 'shop', '--deep'), 0);
  assert.deepEqual(
    fake.visits.map((visit) => [visit.width, visit.passes.includes('deep'), visit.screenshot]),
    [
      [390, true, join(h.draftDir, 'v1', 'build', 'shots', 'filled-390.png')],
      [1280, true, join(h.draftDir, 'v1', 'build', 'shots', 'filled-1280.png')],
      [768, false, null],
      [1024, false, null],
      [1440, false, null],
      [1920, false, null],
      [2560, false, null],
    ],
  );
  assert.deepEqual((h.out.at(-1) ?? '').split('\n').slice(-3), [
    'Deep check: the stress passes ran, and the widths 1024, 1440, 1920, 2560 were checked too.',
    `Screenshots: 2 in ${join(h.draftDir, 'v1', 'build', 'shots')}`,
    `Results: ${join(h.draftDir, 'v1', 'build', 'json', 'checks.json')}`,
  ]);
  assert.equal(savedDeep(h.draftDir), true);
  assert.equal(await h.run('check', 'shop', '--deep', '--json'), 0);
  assert.equal(h.data().deep, true);

  // Without the flag the file does not say deep, and the text has no deep line.
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(savedDeep(h.draftDir), undefined);
  assert.ok(!(h.out.at(-1) ?? '').includes('Deep check'));
  assert.equal(fake.visits.filter((visit) => visit.width === 1440).length, 2);
});

test('check: deep in the decisions file makes the check deep; an option or the default decides otherwise', async () => {
  const fake = fakeBrowser();
  const h = await harness(fake.browser);
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(savedDeep(h.draftDir), undefined);
  writeFileSync(join(h.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\ncheck: deep\n---\n');
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(savedDeep(h.draftDir), true);
  assert.equal(await h.run('check', 'shop', '--deep', '--json'), 0);
  assert.equal(h.data().deep, true);
  writeFileSync(join(h.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\ncheck: normal\n---\n');
  assert.equal(await h.run('check', 'shop'), 0);
  assert.equal(savedDeep(h.draftDir), undefined);
  assert.equal(await h.run('check', 'shop', '--deep'), 0);
  assert.equal(savedDeep(h.draftDir), true);
});

test('a finding seen only with an option value names it in the text and carries it in --json', async () => {
  const fake = fakeBrowser((visit) => ({
    pageErrors: visit.options.columns === '2' ? ['two columns break it'] : [],
  }));
  const h = await harness(fake.browser);
  writeFileSync(
    join(h.draftDir, 'v1', 'src', 'json', 'options.json'),
    JSON.stringify({
      schemaVersion: 1,
      options: [
        {
          id: 'columns',
          label: 'Columns',
          default: '3',
          values: [
            { id: '2', label: '2' },
            { id: '3', label: '3' },
          ],
        },
      ],
    }),
  );
  assert.equal(await h.run('check', 'shop', '--json'), 0);
  // The fixture's sections take no `options` prop, so the type check has findings of its own:
  // those are of the default combination and name no value.
  const { findings } = h.data();
  const seen = findings.filter((one) => one.rule === 'runtime/page-error');
  assert.deepEqual(
    seen.map((one) => one.options),
    [[{ id: 'columns', value: '2' }]],
  );
  const rest = findings.filter((one) => one.rule !== 'runtime/page-error');
  assert.ok(rest.every((one) => one.options.length === 0));
  assert.equal(await h.run('check', 'shop'), 0);
  assert.ok((h.out.at(-1) ?? '').includes('columns=2'));
  // Two runs, each visiting the other value at the two main widths.
  assert.equal(fake.visits.filter((visit) => visit.options.columns === '2').length, 4);
});

test('--deep without a browser runs nothing deep and does not say so', async () => {
  const h = await harness();
  assert.equal(await h.run('check', 'shop', '--deep'), 0);
  assert.equal(savedDeep(h.draftDir), undefined);
  assert.ok(!(h.out.at(-1) ?? '').includes('Deep check'));
});
