import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createContextCommand,
  createDraftCommand,
  createLayoutCommand,
  runCli,
} from '../../../src/cli/index.ts';
import { createFsDraftStore } from '../../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft } from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../../src/shared/index.ts';
import { GOOD_LAYOUT, NOW, TINY } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';

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
    writeFileSync(join(io.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\n---\n');
  }
  const deps = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
  };
  const commands = [
    createDraftCommand(deps),
    createLayoutCommand(deps),
    createContextCommand(deps),
  ];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  /** The data of the last JSON answer, as the caller says it is shaped. */
  const data = <T>(): T => (JSON.parse(out.at(-1) ?? '') as { data: T }).data;
  const error = (): { code: string; message: string } =>
    (JSON.parse(err.at(-1) ?? '') as { error: { code: string; message: string } }).error;
  const draftDir = (slug: string) => join(io.cwd, '.kitvas', 'drafts', slug);
  return { out, err, io, run, data, error, draftDir };
}

/** The fields of `draft new` and `draft show` answers that these tests read. */
type DraftData = {
  view: string;
  draft: { title: string; kit: { id: string; hash: string } };
  path: string;
};

test('draft new creates the draft from the project kit', async () => {
  const h = harness();
  assert.equal(await h.run('draft', 'new', 'shop', '--title', 'Bike shop', '--json'), 0);
  const created = h.data<DraftData>();
  assert.equal(created.view, 'new');
  assert.equal(created.draft.title, 'Bike shop');
  assert.equal(created.draft.kit.id, 'tiny');
  assert.match(created.draft.kit.hash, /^[0-9a-f]{64}$/);
  assert.equal(created.path, h.draftDir('shop'));
  assert.ok(existsSync(join(h.draftDir('shop'), 'v1', 'md', 'layout.md')));

  assert.equal(await h.run('draft', 'new', 'about'), 0);
  assert.equal(h.out.at(-1), `Created draft "about" in ${h.draftDir('about')}`);
  await h.run('draft', 'show', 'about', '--json');
  assert.equal(h.data<DraftData>().draft.title, 'about');
});

test('draft new refuses a duplicate, a bad slug and a missing slug', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop');
  assert.equal(await h.run('draft', 'new', 'shop', '--json'), 10);
  assert.equal(h.error().code, 'DRAFT_EXISTS');
  assert.equal(await h.run('draft', 'new', 'Bad_Slug', '--json'), 11);
  assert.equal(await h.run('draft', 'new', '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
});

test('list, show and version', async () => {
  const h = harness();
  await h.run('draft', 'list');
  assert.equal(h.out.at(-1), 'No drafts yet. Run "kitvas draft new <slug>".');
  await h.run('draft', 'new', 'shop', '--title', 'Bike shop');
  assert.equal(await h.run('draft', 'version', 'shop'), 0);
  assert.equal(h.out.at(-1), 'Draft "shop" is now at version 2.');
  await h.run('draft', 'list', '--json');
  assert.deepEqual(h.data<{ drafts: unknown }>().drafts, [
    { slug: 'shop', title: 'Bike shop', kit: 'tiny', version: 2, valid: true },
  ]);
  await h.run('draft', 'list');
  assert.equal(h.out.at(-1), 'shop  Bike shop  version 2');
  await h.run('draft', 'show', 'shop');
  assert.equal(h.out.at(-1), 'Bike shop (shop)\nKit: tiny 1.0.0\nVersions: 2, latest 2');
  assert.equal(await h.run('draft', 'show', 'nope', '--json'), 9);
  assert.equal(await h.run('draft', 'nope'), 2);
  assert.match(h.err.at(-1) ?? '', /unknown draft command "nope"/);
});

test('layout reports problems, then writes the entry files', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop');
  assert.equal(await h.run('layout', 'shop'), 0);
  assert.match(
    h.out.at(-1) ?? '',
    /^Layout of "shop" has 1 problem\(s\):\n {2}layout: The layout has no sections\./,
  );

  writeFileSync(join(h.draftDir('shop'), 'v1', 'md', 'layout.md'), GOOD_LAYOUT);
  assert.equal(await h.run('layout', 'shop', '--json'), 0);
  const layout = h.data<{ valid: boolean; generated: string[]; sections: unknown[] }>();
  assert.equal(layout.valid, true);
  assert.deepEqual(layout.generated, ['v1/src/tsx/index.tsx', 'v1/src/scss/index.scss']);
  assert.equal(layout.sections.length, 2);
  assert.ok(existsSync(join(h.draftDir('shop'), 'v1', 'src', 'tsx', 'index.tsx')));
  await h.run('layout', 'shop');
  assert.equal(
    h.out.at(-1),
    [
      'Layout of "shop" is valid: 2 section(s). Entry files written.',
      '  hero           not written yet',
      '  order-summary  not written yet',
    ].join('\n'),
  );
  assert.equal(await h.run('layout', '--json'), 2);
});

test('context returns one section; a missing --section or section is an error', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop');
  writeFileSync(join(h.draftDir('shop'), 'v1', 'md', 'layout.md'), GOOD_LAYOUT);
  assert.equal(await h.run('context', 'shop', '--section', 'hero', '--json'), 0);
  const context = h.data<{ section: { component: string }; kit: { components: unknown[] } }>();
  assert.equal(context.section.component, 'Hero');
  assert.equal(context.kit.components.length, 1);
  assert.equal(await h.run('context', 'shop', '--section', 'hero'), 0);
  assert.equal((JSON.parse(h.out.at(-1) ?? '') as { section: { id: string } }).section.id, 'hero');
  assert.equal(await h.run('context', 'shop', '--json'), 2);
  assert.equal(await h.run('context', 'shop', '--section', 'footer', '--json'), 12);
  assert.equal(h.error().code, 'SECTION_NOT_FOUND');
});

test('context --save writes the file and answers its path', async () => {
  const h = harness();
  await h.run('draft', 'new', 'shop');
  writeFileSync(join(h.draftDir('shop'), 'v1', 'md', 'layout.md'), GOOD_LAYOUT);
  const file = join(h.draftDir('shop'), 'v1', 'build', 'context', 'hero.json');
  assert.equal(await h.run('context', 'shop', '--section', 'hero', '--save', '--json'), 0);
  assert.deepEqual(h.data(), { section: 'hero', path: file });
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { section: { id: string } };
  assert.equal(saved.section.id, 'hero');
  assert.equal(await h.run('context', 'shop', '--section', 'hero', '--save'), 0);
  assert.equal(h.out.at(-1), `Saved the context of section hero to ${file}`);
  // Without --save nothing is written.
  rmSync(file);
  assert.equal(await h.run('context', 'shop', '--section', 'hero', '--json'), 0);
  assert.equal(existsSync(file), false);
});

test('context of a craft draft needs no section and is saved as craft.json', async () => {
  const h = harness();
  createDraft(createFsDraftStore(join(workspaceDir(h.io.cwd), 'drafts')), {
    slug: 'spark',
    title: 'Spark',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: { subject: 'logo', name: 'Spark', description: 'A mark for the Spark shop.' },
  });
  assert.equal(await h.run('context', 'spark', '--json'), 0);
  const context = h.data<{ craft: { subject: string }; kit: { tokens: unknown[] } }>();
  assert.equal(context.craft.subject, 'logo');
  assert.equal(context.kit.tokens.length, 8);
  const file = join(h.draftDir('spark'), 'v1', 'build', 'context', 'craft.json');
  assert.equal(await h.run('context', 'spark', '--save', '--json'), 0);
  assert.deepEqual(h.data(), { path: file });
  assert.ok(existsSync(file));
  assert.equal(await h.run('context', 'spark', '--save'), 0);
  assert.equal(h.out.at(-1), `Saved the craft context to ${file}`);
  // A craft draft has no sections to ask for.
  assert.equal(await h.run('context', 'spark', '--section', 'hero', '--json'), 12);
});

test('without a workspace every command says to run init', async () => {
  const h = harness({ workspace: false });
  for (const argv of [
    ['draft', 'list'],
    ['draft', 'new', 'shop'],
    ['layout', 'shop'],
    ['context', 'shop', '--section', 'hero'],
  ]) {
    assert.equal(await h.run(...argv, '--json'), 13, argv.join(' '));
    assert.equal(h.error().code, 'WORKSPACE_MISSING');
  }
});
