import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDraftCommand, runCli } from '../../../src/cli/index.ts';
import { createFsDraftStore } from '../../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../../src/shared/index.ts';
import type { TrashCaller } from '../../../src/studio/index.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { fakeLifecycle } from '../../helpers/studio/fake-lifecycle.ts';
import { SAMPLE_STATE } from '../../helpers/studio/studio-state.ts';
import { tempDir } from '../../helpers/tmp.ts';

const AT = '2026-11-24T10:00:00.000Z';
const item = (slug: string) => ({ slug, title: slug, deletedAt: AT });

/** A studio that answers each `METHOD path` with its answer, else 404; the calls are kept. */
function fakeStudio(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const call: TrashCaller = async (_state, made) => {
    const key = `${made.method} ${made.path}`;
    calls.push(key);
    const body = answers[key];
    return body === undefined
      ? { status: 404, body: { code: 'DRAFT_NOT_FOUND', detail: 'none' } }
      : { status: 200, body };
  };
  return { call, calls };
}

/** `running`: a studio answers for the project; else none does and the files are used. */
function harness(running: boolean, call: TrashCaller) {
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
  const lifecycle = fakeLifecycle(running ? { running: SAMPLE_STATE } : {});
  const base = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
  };
  // The same command with and without a studio: the files are made through the plain one.
  const plain = createDraftCommand(base);
  const withStudio = createDraftCommand({
    ...base,
    studio: { lifecycle: () => lifecycle.deps, call },
  });
  const run = (...argv: string[]) => runCli(argv, [withStudio], io);
  const direct = (...argv: string[]) => runCli(argv, [plain], io);
  const data = <T>(): T => (JSON.parse(out.at(-1) ?? '') as { data: T }).data;
  const kitvas = (...parts: string[]) => join(io.cwd, '.kitvas', ...parts);
  return { run, direct, data, kitvas, out, err };
}

test('with a studio running, draft delete asks it and leaves the files to it', async () => {
  const studio = fakeStudio({ 'DELETE /api/v1/drafts/shop': { deleted: item('shop') } });
  const h = harness(true, studio.call);
  await h.direct('draft', 'new', 'shop');
  assert.equal(await h.run('draft', 'delete', 'shop', '--json'), 0);
  assert.deepEqual(studio.calls, ['DELETE /api/v1/drafts/shop']);
  const answer = h.data<{
    view: string;
    deleted: { slug: string; entry: string };
    restore: string;
  }>();
  assert.equal(answer.view, 'delete');
  assert.equal(answer.deleted.slug, 'shop');
  assert.equal(answer.restore, 'kitvas draft restore shop');
  assert.ok(answer.deleted.entry.startsWith('shop'));
  // The stub did not move anything: the studio would have.
  assert.ok(existsSync(h.kitvas('drafts', 'shop', 'draft.json')));
});

test('with no studio, draft delete moves the files itself', async () => {
  const studio = fakeStudio({});
  const h = harness(false, studio.call);
  await h.direct('draft', 'new', 'shop');
  assert.equal(await h.run('draft', 'delete', 'shop', '--json'), 0);
  assert.deepEqual(studio.calls, []);
  assert.equal(existsSync(h.kitvas('drafts', 'shop')), false);
});

test('with a studio running, restore and purge go through its routes', async () => {
  const studio = fakeStudio({
    'POST /api/v1/trash/shop/restore': { restored: item('shop') },
    'DELETE /api/v1/trash/shop': { purged: [item('shop')] },
    'DELETE /api/v1/trash/other': { purged: [item('other')] },
  });
  const h = harness(true, studio.call);
  for (const slug of ['shop', 'other']) {
    await h.direct('draft', 'new', slug);
    await h.direct('draft', 'delete', slug);
  }
  assert.equal(await h.run('draft', 'restore', 'shop', '--json'), 0);
  assert.equal(h.data<{ restored: { slug: string } }>().restored.slug, 'shop');
  assert.equal(await h.run('draft', 'purge', 'shop', '--json'), 0);
  assert.equal(h.data<{ purged: unknown[] }>().purged.length, 1);
  assert.equal(await h.run('draft', 'purge', '--all', '--json'), 0);
  assert.deepEqual(studio.calls, [
    'POST /api/v1/trash/shop/restore',
    'DELETE /api/v1/trash/shop',
    // `--all` goes through the slugs newest first; the stub removed nothing, so both are there.
    'DELETE /api/v1/trash/other',
    'DELETE /api/v1/trash/shop',
  ]);
});

test('a refusal of the studio keeps its code', async () => {
  const studio = fakeStudio({});
  const h = harness(true, studio.call);
  await h.direct('draft', 'new', 'shop');
  assert.equal(await h.run('draft', 'delete', 'shop', '--json'), 9);
});

test('restore of a name that is not in the trash points at the deleted list', async () => {
  const studio = fakeStudio({});
  const h = harness(true, studio.call);
  assert.equal(await h.run('draft', 'restore', 'nope', '--json'), 62);
  assert.deepEqual(studio.calls, []);
});

test('a refusal that is not about the draft is told in the words of the studio', async () => {
  const call: TrashCaller = async () => ({
    status: 400,
    body: { code: 'REQUEST_INVALID', detail: 'The request is not valid: no.' },
  });
  const h = harness(true, call);
  await h.direct('draft', 'new', 'shop');
  await h.run('draft', 'delete', 'shop', '--json');
  const said = JSON.parse(h.err.at(-1) ?? '') as { error: { code: string; message: string } };
  assert.equal(said.error.code, 'INTERNAL');
  assert.match(said.error.message, /the studio answered 400 REQUEST_INVALID: The request is not/);
  // No text of an error with a field the studio's answer cannot fill.
  assert.doesNotMatch(said.error.message, /\{[a-z]+\}/);
});
