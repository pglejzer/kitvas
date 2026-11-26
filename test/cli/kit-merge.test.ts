import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createKitCommand, runCli } from '../../src/cli/index.ts';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../src/shared/index.ts';
import { renderTools } from '../helpers/render.ts';
import { tempDir } from '../helpers/tmp.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  type Json,
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
} from '../kit/helpers/project-kit.ts';

const component = (name: string, extra: Json = {}): Json => ({
  name,
  category: 'display',
  description: `${name} of the fragment.`,
  import: { from: '@acme/ui', name },
  props: [],
  ...extra,
});

/** A project with the npm kit `acme` and the fragments `parts`, by file name, as JSON. */
function harness(parts: Record<string, unknown> = {}) {
  const cwd = tempProject();
  const files: Record<string, string> = {
    'json/tokens.json': JSON.stringify(ACME_TOKENS),
    'json/css-var-map.json': JSON.stringify(ACME_MAP),
  };
  for (const [name, body] of Object.entries(parts)) files[`parts/${name}`] = JSON.stringify(body);
  const kitDir = writeProjectKit(cwd, npmKitJson(), files);
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
  const run = (...argv: string[]) => runCli(['kit', 'merge', ...argv], [command], io);
  const last = (): unknown => JSON.parse(out.at(-1) ?? '');
  return { kitDir, out, err, run, last };
}

test('`kit merge <id> --json` answers what it added and replaced, and what the kit holds', async () => {
  const h = harness({
    'display.json': { components: [component('Badge'), component('Button')] },
    'inputs.json': { components: [component('TextField')] },
  });
  assert.equal(await h.run('acme', '--json'), 0);
  assert.deepEqual(h.last(), {
    ok: true,
    data: {
      view: 'merge',
      id: 'acme',
      merged: true,
      added: ['Badge', 'TextField'],
      replaced: ['Button'],
      components: 4,
      gaps: 0,
      issues: [],
    },
  });
  assert.equal(existsSync(join(h.kitDir, 'parts')), false);
});

test('`kit merge` with a wrong fragment answers its issues in words and writes nothing', async () => {
  const h = harness({
    'inputs.json': { components: [component('TextField', { category: 'widget' })] },
  });
  // The command worked, so the answer is ok and the exit code 0, as `kit check` answers.
  assert.equal(await h.run('acme', '--json'), 0);
  const answer = h.last() as {
    ok: boolean;
    data: { merged: boolean; issues: Record<string, unknown>[] };
  };
  assert.equal(answer.ok, true);
  assert.deepEqual(Object.keys(answer.data), ['view', 'id', 'merged', 'issues']);
  assert.equal(answer.data.merged, false);
  assert.deepEqual(Object.keys(answer.data.issues[0] ?? {}), ['fragment', 'path', 'message']);
  assert.equal(answer.data.issues[0]?.fragment, 'inputs');
  assert.equal(answer.data.issues[0]?.path, 'components.0.category');
  assert.equal(existsSync(join(h.kitDir, 'parts', 'inputs.json')), true);

  await h.run('acme');
  assert.match(
    h.out.at(-1) ?? '',
    /^Nothing was merged into kit "acme": 1 problem\(s\) in parts\/:\n {2}inputs {2}components\.0\.category: /,
  );
});

test('`kit merge` says what it did, and that there was nothing to merge', async () => {
  const h = harness({ 'more.json': { components: [component('Link')] } });
  await h.run('acme');
  assert.equal(
    h.out.at(-1),
    'Merged the fragments into kit "acme": 1 added, 0 replaced. It has 3 component(s) and 0 gap(s) now.\nNext: run "kitvas kit verify acme".',
  );
  await h.run('acme', '--json');
  assert.deepEqual(h.last(), {
    ok: true,
    data: { view: 'merge', id: 'acme', merged: false, components: 3, issues: [] },
  });
  await h.run('acme');
  assert.equal(
    h.out.at(-1),
    'Kit "acme" has no fragments in parts/ to merge; it has 3 component(s).',
  );
});

test('`kit merge` needs a kit id', async () => {
  const h = harness();
  assert.equal(await h.run('--json'), 2);
  const answer = JSON.parse(h.err.at(-1) ?? '') as { error: { code: string; message: string } };
  assert.equal(answer.error.code, 'USAGE');
  assert.match(answer.error.message, /kit merge needs a kit id/);
});
