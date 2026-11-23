import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createKitCommand, type KitView, runCli } from '../../src/cli/index.ts';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { loadKit } from '../../src/kit/index.ts';
import { catalogDir, PLUGIN_ROOT, projectKitsDir } from '../../src/shared/index.ts';
import { renderTools } from '../helpers/render.ts';
import { tempDir } from '../helpers/tmp.ts';
import {
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
  writeText,
} from '../kit/helpers/project-kit.ts';

function harness(cwd: string) {
  const out: string[] = [];
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
  });
  const run = (...argv: string[]) => runCli(['kit', 'detect', ...argv], [command], io);
  const data = (): Extract<KitView, { view: 'detect' }> => {
    const answer = JSON.parse(out.at(-1) ?? '') as { ok: boolean; data: KitView };
    assert.equal(answer.ok, true);
    assert.equal(answer.data.view, 'detect');
    return answer.data as Extract<KitView, { view: 'detect' }>;
  };
  return { out, run, data };
}

const twelveTsx = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`components/C${index}.tsx`, 'export {};']),
);

test('detect --json answers kits, active and signs', async () => {
  const cwd = tempProject({
    ...twelveTsx,
    'package.json': JSON.stringify({ dependencies: { '@mui/material': '6.0.0' } }),
  });
  writeProjectKit(cwd, npmKitJson());
  const h = harness(cwd);
  assert.equal(await h.run('--json'), 0);
  const data = h.data();
  assert.deepEqual(data.kits, [{ id: 'acme', source: 'npm', stale: true }]);
  assert.equal(data.active, null);
  assert.deepEqual(data.signs, {
    components: ['components'],
    packages: ['@mui/material'],
    figma: [],
  });
});

test('a kit verified at its current hash is not stale', async () => {
  const cwd = tempProject();
  writeProjectKit(cwd, npmKitJson());
  const { hash } = loadKit(layeredStore(cwd), 'acme');
  writeText(
    join(catalogDir(cwd, 'acme'), 'verify.json'),
    JSON.stringify({
      schemaVersion: 2,
      kit: 'acme',
      hash,
      at: '2026-11-23T10:00:00.000Z',
      valid: true,
      steps: {
        schema: 'passed',
        imports: 'passed',
        types: 'passed',
        render: 'passed',
        tokens: 'passed',
      },
      issues: [],
      notes: [],
    }),
  );
  const h = harness(cwd);
  assert.equal(await h.run('--json'), 0);
  assert.deepEqual(h.data().kits, [{ id: 'acme', source: 'npm', stale: false }]);
});

test('with no kits and no signs the text says so, and a broken package.json is no error', async () => {
  const cwd = tempProject({ 'package.json': '{ broken' });
  const h = harness(cwd);
  assert.equal(await h.run(), 0);
  assert.equal(h.out.length > 0, true);
  assert.equal(await h.run('--json'), 0);
  assert.deepEqual(h.data(), {
    view: 'detect',
    kits: [],
    active: null,
    signs: { components: [], packages: [], figma: [] },
  });
});
