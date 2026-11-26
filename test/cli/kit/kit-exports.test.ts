import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createKitCommand, runCli } from '../../../src/cli/index.ts';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { renderTools } from '../../helpers/draft/render.ts';
import { fixtureProject, removeFixture } from '../../helpers/kit/projects.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { layeredStore } from '../../kit/helpers/project-kit.ts';

function harness(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
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
    previews: () => Promise.reject(new Error('previews is not used here')),
  });
  const run = (...argv: string[]) => runCli(['kit', 'exports', ...argv], [command], io);
  const last = (lines: string[]): unknown => JSON.parse(lines.at(-1) ?? '');
  return { out, err, run, last };
}

test('`kit exports <id> --json` answers the names the package exports, covered and open', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    const h = harness(dir);
    assert.equal(await h.run(kitId, '--json'), 0);
    assert.deepEqual(h.last(h.out), {
      ok: true,
      data: {
        view: 'exports',
        id: 'acme',
        source: { type: 'npm', package: '@acme/ui', version: '1.2.0' },
        total: 4,
        covered: ['Badge', 'Button', 'TextField'],
        open: ['AcmeProvider'],
      },
    });
  } finally {
    removeFixture(dir);
  }
});

test('`kit exports` without an id lists the project kit, and says it in words', async () => {
  const { dir } = fixtureProject('acme-npm');
  try {
    const h = harness(dir);
    assert.equal(await h.run(), 0);
    assert.equal(
      h.out.at(-1),
      '@acme/ui 1.2.0 exports 4 component name(s): kit "acme" has 3 of them, 1 are open.\nOpen: AcmeProvider',
    );
  } finally {
    removeFixture(dir);
  }
});

test('`kit exports` of a kit with no package or folder is KIT_SOURCE_INVALID', async () => {
  const h = harness(tempDir());
  assert.equal(await h.run('tiny', '--json'), 36);
  const answer = h.last(h.err) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(answer.ok, false);
  assert.equal(answer.error.code, 'KIT_SOURCE_INVALID');
  assert.match(answer.error.message, /no package or folder to list/);
});
