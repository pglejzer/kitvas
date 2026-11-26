import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createBuildCommand,
  createDraftCommand,
  disposeRenderTools,
  runCli,
} from '../../../src/cli/index.ts';
import { createFsDraftStore } from '../../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../../src/shared/index.ts';
import { renderTools, writeShopSections } from '../../helpers/draft/render.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { at, parseJson } from '../../render/helpers/json.ts';

async function harness() {
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
  };
  const commands = [createDraftCommand(deps), createBuildCommand(deps)];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const draftDir = join(io.cwd, '.kitvas', 'drafts', 'shop');
  await run('draft', 'new', 'shop', '--title', 'Shop');
  writeShopSections(draftDir);
  /** A field of the last JSON answer's `data`. */
  const data = (...path: (string | number)[]): unknown =>
    at(parseJson(out.at(-1) ?? ''), 'data', ...path);
  return { out, err, run, draftDir, data };
}

test('build writes the page and says where it is', async () => {
  const h = await harness();
  const page = join(h.draftDir, 'v1', 'build', 'html', 'index.html');
  assert.equal(await h.run('build', 'shop'), 0);
  assert.equal(h.out.at(-1), `Built "shop" version 1: 10 element(s) with an id.\nOpen ${page}`);
  assert.ok(existsSync(page));

  assert.equal(await h.run('build', 'shop'), 0);
  assert.equal(h.out.at(-1), `"shop" version 1 is up to date.\nOpen ${page}`);

  assert.equal(await h.run('build', 'shop', '--json'), 0);
  assert.equal(h.data('cached'), true);
  assert.equal(h.data('path'), page);
  assert.deepEqual(h.data('warnings'), []);
});

test('a failed build lists the errors and still exits with 0', async () => {
  const h = await harness();
  rmSync(join(h.draftDir, 'v1', 'src', 'tsx', 'sections', 'Hero.tsx'));
  assert.equal(await h.run('build', 'shop'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.equal(lines[0], 'Build of "shop" failed with 1 error(s):');
  assert.match(lines[1] ?? '', /^ {2}src\/tsx\/index\.tsx:\d+:\d+ /);

  assert.equal(await h.run('build', 'shop', '--json'), 0);
  assert.equal(h.data('built'), false);
  assert.equal(h.data('errors', 0, 'source'), 'bundle');
});

test('the render tools are stopped in order: bundler, styles, utility', async () => {
  const tools = renderTools();
  const stopped: string[] = [];
  const note = (name: string, inner: () => Promise<void>) => async (): Promise<void> => {
    stopped.push(name);
    await inner();
  };
  tools.bundler.dispose = note('bundler', tools.bundler.dispose);
  tools.styles.dispose = note('styles', tools.styles.dispose);
  tools.utility.dispose = note('utility', tools.utility.dispose);
  await disposeRenderTools(tools);
  assert.deepEqual(stopped, ['bundler', 'styles', 'utility']);
});

test('build needs a slug and an existing draft', async () => {
  const h = await harness();
  assert.equal(await h.run('build', '--json'), 2);
  assert.equal(await h.run('build', 'nope', '--json'), 9);
  assert.equal(at(parseJson(h.err.at(-1) ?? ''), 'error', 'code'), 'DRAFT_NOT_FOUND');
});
