import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDraftCommand, runCli } from '../../../src/cli/index.ts';
import { createFsDraftStore } from '../../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../../src/shared/index.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';

function harness() {
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
  };
  const run = (...argv: string[]) => runCli(argv, [createDraftCommand(deps)], io);
  const data = <T>(): T => (JSON.parse(out.at(-1) ?? '') as { data: T }).data;
  const error = (): { code: string; message: string } =>
    (JSON.parse(err.at(-1) ?? '') as { error: { code: string; message: string } }).error;
  const kitvas = (...parts: string[]) => join(io.cwd, '.kitvas', ...parts);
  return { out, err, io, run, data, error, kitvas };
}

type Deleted = { slug: string; title: string; deletedAt: string; entry: string };

test('draft delete moves the draft to the trash and says how to bring it back', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop', '--title', 'Bike shop');
  assert.equal(await h.run('draft', 'delete', 'shop', '--json'), 0);
  const answer = h.data<{ view: string; deleted: Deleted; path: string; restore: string }>();
  assert.equal(answer.view, 'delete');
  assert.equal(answer.deleted.slug, 'shop');
  assert.equal(answer.deleted.title, 'Bike shop');
  assert.equal(answer.restore, 'kitvas draft restore shop');
  assert.equal(answer.path, h.kitvas('trash', answer.deleted.entry));
  assert.ok(existsSync(answer.path));
  assert.equal(existsSync(h.kitvas('drafts', 'shop')), false);

  await h.run('draft', 'list');
  assert.equal(h.out.at(-1), 'No drafts yet. Run "kitvas draft new <slug>".');
});

test('draft delete says in words where the draft is and the command that undoes it', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop');
  assert.equal(await h.run('draft', 'delete', 'shop'), 0);
  const [first, second] = (h.out.at(-1) ?? '').split('\n');
  assert.match(first ?? '', /^Deleted draft "shop"\./);
  assert.match(first ?? '', /trash/);
  assert.equal(second, 'Bring it back with: kitvas draft restore shop');
});

test('draft list --deleted lists what is in the trash, newest first', async () => {
  const h = harness();
  await h.run('draft', 'list', '--deleted');
  assert.equal(h.out.at(-1), 'No deleted drafts.');
  await h.run('draft', 'new', 'one', '--title', 'First');
  await h.run('draft', 'new', 'two', '--title', 'Second');
  await h.run('draft', 'delete', 'one');
  await h.run('draft', 'delete', 'two');
  assert.equal(await h.run('draft', 'list', '--deleted', '--json'), 0);
  const listed = h.data<{ view: string; drafts: Deleted[] }>();
  assert.equal(listed.view, 'deleted');
  assert.deepEqual(
    listed.drafts.map((item) => item.slug),
    ['two', 'one'],
  );
  await h.run('draft', 'list', '--json');
  assert.deepEqual(h.data<{ drafts: unknown[] }>().drafts, []);
});

test('draft restore brings the draft back, or says why not', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop', '--title', 'Bike shop');
  await h.run('draft', 'delete', 'shop');
  assert.equal(await h.run('draft', 'restore', 'shop', '--json'), 0);
  assert.equal(h.data<{ restored: Deleted }>().restored.title, 'Bike shop');
  assert.ok(existsSync(h.kitvas('drafts', 'shop', 'draft.json')));
  await h.run('draft', 'show', 'shop');
  assert.match(h.out.at(-1) ?? '', /^Bike shop \(shop\)/);

  // Nothing deleted under that name now, and a name taken by a live draft.
  assert.equal(await h.run('draft', 'restore', 'shop', '--json'), 62);
  assert.equal(h.error().code, 'DRAFT_NOT_DELETED');
  assert.match(h.error().message, /draft list --deleted/);
  await h.run('draft', 'delete', 'shop');
  await h.run('draft', 'new', 'shop');
  assert.equal(await h.run('draft', 'restore', 'shop', '--json'), 10);
  assert.equal(h.error().code, 'DRAFT_EXISTS');
  assert.equal(await h.run('draft', 'restore', '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
});

test('draft purge removes one slug or all for good and lists what it removed', async () => {
  const h = harness();
  for (const slug of ['a', 'b', 'c']) await h.run('draft', 'new', slug);
  for (const slug of ['a', 'b']) await h.run('draft', 'delete', slug);

  assert.equal(await h.run('draft', 'purge', 'a', '--json'), 0);
  const first = h.data<{ view: string; purged: Deleted[] }>();
  assert.equal(first.view, 'purge');
  assert.deepEqual(
    first.purged.map((item) => item.slug),
    ['a'],
  );
  assert.equal(existsSync(h.kitvas('trash', first.purged[0]?.entry ?? '?')), false);
  assert.equal(await h.run('draft', 'purge', 'a', '--json'), 62);

  assert.equal(await h.run('draft', 'purge', '--all'), 0);
  const lines = (h.out.at(-1) ?? '').split('\n');
  assert.equal(lines[0], 'Removed 1 deleted draft(s) for good:');
  assert.match(lines[1] ?? '', /^b\b/);
  await h.run('draft', 'list', '--json');
  assert.deepEqual(
    h.data<{ drafts: { slug: string }[] }>().drafts.map((item) => item.slug),
    ['c'],
  );
  await h.run('draft', 'purge', '--all');
  assert.equal(h.out.at(-1), 'Nothing deleted to remove.');
});

test('draft purge needs a slug or --all, not both and not neither', async () => {
  const h = harness();
  assert.equal(await h.run('draft', 'purge', '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
  assert.equal(await h.run('draft', 'purge', 'a', '--all', '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
});

test('draft delete of a missing or badly named draft fails with its own code', async () => {
  const h = harness();
  assert.equal(await h.run('draft', 'delete', 'nope', '--json'), 9);
  assert.equal(h.error().code, 'DRAFT_NOT_FOUND');
  assert.equal(await h.run('draft', 'delete', 'Bad_Slug', '--json'), 11);
  assert.equal(h.error().code, 'DRAFT_INVALID');
  assert.equal(await h.run('draft', 'delete', '--json'), 2);
});
