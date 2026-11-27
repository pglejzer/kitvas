import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { VerifyFile } from '../../../src/checks/index.ts';
import { createKitCommand, type KitView, runCli } from '../../../src/cli/index.ts';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { renderTools } from '../../helpers/draft/render.ts';
import { fixtureProject } from '../../helpers/kit/projects.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { layeredStore } from '../../kit/helpers/project-kit.ts';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const BUTTON_TS = 'src/app/button/button.component.ts';

const PASSED: VerifyFile = {
  schemaVersion: 1,
  kit: 'acme-tpl',
  hash: 'hash',
  at: '2026-11-27T10:00:00.000Z',
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
};

const WITH_COMPARED: VerifyFile = {
  ...PASSED,
  compared: [
    { component: 'Button', level: 'app' },
    { component: 'Field', level: 'code' },
    { component: 'Card', level: 'read', why: 'none' },
  ],
};

function harness() {
  const { dir: cwd, kitId } = fixtureProject('acme-templates');
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
    verify: () => Promise.resolve(WITH_COMPARED),
    scan: () => Promise.reject(new Error('scan is not used here')),
    crop: () => Promise.reject(new Error('crop is not used here')),
    previews: () => Promise.reject(new Error('previews is not used here')),
  });
  const run = (...argv: string[]) => runCli(['kit', ...argv], [command], io);
  const data = <V extends KitView['view']>(view: V): Extract<KitView, { view: V }> => {
    const value = (JSON.parse(out.at(-1) ?? '') as { data: Extract<KitView, { view: V }> }).data;
    assert.equal(value.view, view);
    return value;
  };
  return { cwd, kitId, out, run, data };
}

test('verify says how the components were compared, and --json carries compared unchanged', async () => {
  const h = harness();
  assert.equal(await h.run('verify', h.kitId), 0);
  assert.match(h.out.join('\n'), /1 with the app, 1 with the code, 1 read only/);
  assert.equal(await h.run('verify', h.kitId, '--json'), 0);
  assert.deepEqual((h.data('verify') as { compared?: unknown }).compared, WITH_COMPARED.compared);
});

test('verify records the origins, and show and detect name an out-of-date component', async () => {
  const h = harness();
  await h.run('verify', h.kitId, '--json');
  assert.equal(existsSync(join(projectKitsDir(h.cwd), h.kitId, 'origins.json')), true);

  await h.run('show', h.kitId, '--json');
  assert.deepEqual(h.data('show').kit.outdated, []);

  const file = join(h.cwd, ...BUTTON_TS.split('/'));
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n// changed`);
  await h.run('show', h.kitId, '--json');
  assert.deepEqual(h.data('show').kit.outdated, [{ name: 'Button', reason: 'changed' }]);
  await h.run('detect', '--json');
  assert.deepEqual(h.data('detect').kits[0]?.outdated, ['Button']);

  // --current: looked at against the project as it is, and needed no change.
  await h.run('verify', h.kitId, '--current', 'Button', '--json');
  await h.run('show', h.kitId, '--json');
  assert.deepEqual(h.data('show').kit.outdated, []);
});

test('images adds screenshots to a written kit', async () => {
  const h = harness();
  mkdirSync(join(h.cwd, 'shots'), { recursive: true });
  writeFileSync(join(h.cwd, 'shots', 'home.png'), Uint8Array.from(PNG));
  writeFileSync(join(h.cwd, 'shots', 'notes.txt'), 'not an image');
  assert.equal(await h.run('images', h.kitId, '--from', 'shots', '--json'), 0);
  const view = h.data('images');
  assert.equal(view.copied, 1);
  assert.deepEqual(view.skipped, [{ file: 'shots/notes.txt', reason: 'kits.new.skip.type' }]);
  assert.equal(
    existsSync(join(projectKitsDir(h.cwd), h.kitId, 'source', 'images', 'home.png')),
    true,
  );
  assert.equal(await h.run('images', h.kitId, '--json'), 2);
  assert.equal(await h.run('images', h.kitId, '--from', 'nope', '--json'), 36);
});
