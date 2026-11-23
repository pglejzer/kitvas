import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDraftCommand, createMapCommand, runCli } from '../../src/cli/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../src/shared/index.ts';
import { GOOD_LAYOUT } from '../helpers/drafts.ts';
import { checksOf, finding } from '../helpers/findings.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { tempDir } from '../helpers/tmp.ts';

function harness(options: { workspace?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  if (options.workspace !== false) {
    initWorkspace(io.cwd);
    writeFileSync(join(io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  }
  const deps = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
  };
  const commands = [createDraftCommand(deps), createMapCommand(deps)];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const data = (): { drafts?: unknown } =>
    (JSON.parse(out.at(-1) ?? '') as { data: { drafts?: unknown } }).data;
  const error = (): { code: string; message: string } =>
    (JSON.parse(err.at(-1) ?? '') as { error: { code: string; message: string } }).error;
  const dir = (slug: string) => join(io.cwd, '.kitvas', 'drafts', slug, 'v1');
  return { out, err, run, data, error, dir };
}

function build(dir: string): void {
  mkdirSync(join(dir, 'build', 'html'), { recursive: true });
  mkdirSync(join(dir, 'build', 'json'), { recursive: true });
  writeFileSync(join(dir, 'build', 'html', 'index.html'), '<html></html>');
  writeFileSync(
    join(dir, 'build', 'json', 'ids.json'),
    JSON.stringify({
      ids: { 'Hero/Button.0': { file: 'src/tsx/Hero.tsx', line: 4, column: 7, tag: 'Button' } },
    }),
  );
  writeFileSync(
    join(dir, 'build', 'json', 'checks.json'),
    JSON.stringify(checksOf([finding(), finding({ severity: 'review', line: 20 })])),
  );
}

test('map lists the drafts, with the counts of the last check', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop', '--title', 'Bike shop');
  await h.run('draft', 'new', 'about');
  build(h.dir('shop'));
  assert.equal(await h.run('map', '--json'), 0);
  assert.deepEqual(h.data().drafts, [
    { slug: 'about', title: 'about', version: 1, built: false, checked: null },
    { slug: 'shop', title: 'Bike shop', version: 1, built: true, checked: { fix: 1, review: 1 } },
  ]);
  assert.equal(await h.run('map'), 0);
  assert.equal(
    h.out.at(-1),
    [
      'about  about      version 1  not built  not checked',
      'shop   Bike shop  version 1  built      1 to fix, 1 to review',
    ].join('\n'),
  );
});

test('map of one draft has sections with their files and the elements of the build', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop');
  writeFileSync(join(h.dir('shop'), 'md', 'layout.md'), GOOD_LAYOUT);
  mkdirSync(join(h.dir('shop'), 'src', 'tsx', 'sections'), { recursive: true });
  writeFileSync(join(h.dir('shop'), 'src', 'tsx', 'sections', 'Hero.tsx'), 'x');
  build(h.dir('shop'));
  assert.equal(await h.run('map', 'shop', '--json'), 0);
  assert.deepEqual(h.data(), {
    slug: 'shop',
    version: 1,
    built: true,
    sections: [
      { id: 'hero', files: ['v1/src/tsx/sections/Hero.tsx'] },
      { id: 'order-summary', files: [] },
    ],
    elements: [
      { id: 'Hero/Button.0', file: 'src/tsx/Hero.tsx', line: 4, column: 7, tag: 'Button' },
    ],
    checked: { fix: 1, review: 1 },
  });
  assert.equal(await h.run('map', 'shop'), 0);
  assert.match(h.out.at(-1) ?? '', /^Draft "shop", version 1, built, 1 to fix, 1 to review\n/);
  assert.match(h.out.at(-1) ?? '', /hero {11}v1\/src\/tsx\/sections\/Hero\.tsx/);
  assert.match(h.out.at(-1) ?? '', /1 element\(s\) with ids$/);
});

test('map of an unknown draft is an error; without a workspace it says to run init', async () => {
  const h = harness();
  assert.equal(await h.run('map', 'nope', '--json'), 9);
  assert.equal(h.error().code, 'DRAFT_NOT_FOUND');
  const bare = harness({ workspace: false });
  assert.equal(await bare.run('map', '--json'), 13);
  assert.equal(bare.error().code, 'WORKSPACE_MISSING');
});
