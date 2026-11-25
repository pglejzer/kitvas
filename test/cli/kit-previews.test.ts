import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { PreviewsResult } from '../../src/checks/index.ts';
import { createKitCommand, type KitView, runCli } from '../../src/cli/index.ts';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT, projectKitsDir, workspaceDir } from '../../src/shared/index.ts';
import { renderTools } from '../helpers/render.ts';
import { tempDir } from '../helpers/tmp.ts';
import { layeredStore } from '../kit/helpers/project-kit.ts';

const RESULT: PreviewsResult = {
  id: 'base',
  cached: false,
  components: ['Button', 'Card'],
  failed: [{ component: 'Dialog', error: 'the example failed to render' }],
  icons: 8,
  path: '/p/.kitvas/cache/catalog/base/previews/v1-0123456789abcdef',
};

function harness(workspace: boolean) {
  const cwd = tempDir();
  if (workspace) mkdirSync(workspaceDir(cwd), { recursive: true });
  const out: string[] = [];
  const asked: string[][] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => out.push(text),
    cwd,
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  const command = createKitCommand({
    kits: layeredStore(cwd),
    kitWriter: createFolderKitWriter(projectKitsDir(cwd)),
    projectFiles: createProjectFiles,
    render: renderTools,
    verify: () => Promise.reject(new Error('verify is not used here')),
    scan: () => Promise.reject(new Error('scan is not used here')),
    crop: () => Promise.reject(new Error('crop is not used here')),
    previews: async (project, id) => {
      asked.push([project, id]);
      return RESULT;
    },
  });
  const run = (...argv: string[]) => runCli(['kit', 'previews', ...argv], [command], io);
  return { cwd, out, asked, run };
}

test('`kit previews <id> --json` answers the previews view of the use case', async () => {
  const { cwd, out, asked, run } = harness(true);
  await run('base', '--json');
  const answer = JSON.parse(out.at(-1) ?? '') as { ok: boolean; data: KitView };
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.data, { view: 'previews', ...RESULT });
  assert.deepEqual(asked, [[cwd, 'base']]);
});

test('`kit previews` says what it made and what it could not shoot', async () => {
  const { out, run } = harness(true);
  await run('base');
  const text = out.join('\n');
  assert.match(text, /base/);
  assert.match(text, /Dialog: the example failed to render/);
});

test('`kit previews` needs a workspace, like `kit build`', async () => {
  const { out, asked, run } = harness(false);
  await run('base', '--json');
  const answer = JSON.parse(out.at(-1) ?? '') as { ok: boolean; error?: { code: string } };
  assert.equal(answer.ok, false);
  assert.equal(answer.error?.code, 'WORKSPACE_MISSING');
  assert.deepEqual(asked, []);
});
