import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  type InventoryItem,
  type ProtectedItem,
  type Survey,
  type SurveyReport,
  startRework,
} from '../../src/checks/index.ts';
import { createDraftCommand, createReworkCommand, runCli } from '../../src/cli/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../src/shared/index.ts';
import { node, page, text } from '../checks/rules/facts.ts';
import { fakeBrowser, t } from '../helpers/checks.ts';
import { NOW } from '../helpers/drafts.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { tempDir } from '../helpers/tmp.ts';

const PAGE = 'https://example.com/pricing';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const inventoryAt = (width: number): InventoryItem[] =>
  (
    [
      { kind: 'brand', text: 'Acme' },
      { kind: 'link', text: 'Docs', href: '/docs' },
      { kind: 'heading', text: 'Pricing', level: 1 },
      { kind: 'action', text: width === 1280 ? 'Start free trial' : 'Try it' },
      { kind: 'price', text: '$49' },
      { kind: 'field', text: 'Work email' },
    ] as const
  ).map((item) => ({ ...item, width, read: 'measured' as const }));

/** A live page with one paragraph of template copy, its shot written as the adapter does. */
const surveyed = (input: Survey): SurveyReport => {
  mkdirSync(dirname(input.shot), { recursive: true });
  writeFileSync(input.shot, PNG);
  return {
    state: 'surveyed',
    facts: page([node({ tag: 'p', text: text('Lorem ipsum dolor') })], {
      viewport: [input.width, input.height],
      scrollWidth: input.width,
    }),
    inventory: inventoryAt(input.width),
    viewportMeta: true,
  };
};

type NewData = {
  view: string;
  draft: { slug: string; kind: string; rework: { source: string } };
  path: string;
  before: { measured: boolean; problems: number; inventory: number };
};

function harness(survey: (input: Survey) => SurveyReport = surveyed) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  initWorkspace(io.cwd);
  writeFileSync(join(io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  const deps = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
  };
  const fake = fakeBrowser(undefined, survey);
  const commands = [
    createDraftCommand(deps),
    createReworkCommand({
      ...deps,
      start: (project, input, translate) =>
        startRework(
          {
            drafts: deps.draftsAt(project),
            kits: deps.kits,
            browser: fake.browser,
            lookup: () => Promise.resolve(['93.184.216.34']),
            readFile: (path) => {
              try {
                return readFileSync(path);
              } catch {
                return undefined;
              }
            },
            writeFile: (path, bytes) => {
              mkdirSync(dirname(path), { recursive: true });
              writeFileSync(path, bytes);
            },
            remove: (path) => rmSync(path, { recursive: true, force: true }),
            now: () => NOW,
            t: translate,
          },
          input,
        ),
    }),
  ];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const data = <T>(): T => (JSON.parse(out.at(-1) ?? '') as { data: T }).data;
  const error = (): { code: string; message: string } =>
    (JSON.parse(err.at(-1) ?? '') as { error: { code: string; message: string } }).error;
  const draftDir = (slug: string) => join(io.cwd, '.kitvas', 'drafts', slug);
  /** A file in the project folder, named as the person would pass it. */
  const file = (name: string, bytes: Uint8Array | string): string => {
    writeFileSync(join(io.cwd, name), bytes);
    return name;
  };
  return { out, err, io, run, data, error, draftDir, file, fake };
}

test('rework new --url captures the page and propose lists what it must keep', async () => {
  const h = harness();
  assert.equal(
    await h.run('rework', 'new', 'pricing', '--url', PAGE, '--json'),
    0,
    h.err.join('\n'),
  );
  const created = h.data<NewData>();
  assert.equal(created.view, 'new');
  assert.equal(created.draft.kind, 'rework');
  assert.deepEqual(created.draft.rework, { source: 'url' });
  assert.equal(created.path, h.draftDir('pricing'));
  assert.equal(created.before.measured, true);
  assert.equal(created.before.inventory, 12);
  assert.ok(created.before.problems >= 2);
  const before = join(h.draftDir('pricing'), 'before');
  for (const name of ['source.json', 'inventory.json', 'problems.json', 'shots/390.png']) {
    assert.ok(existsSync(join(before, name)), name);
  }
  const problems = JSON.parse(readFileSync(join(before, 'problems.json'), 'utf8')) as {
    counts: Record<string, number>;
  };
  assert.equal(problems.counts['ux/placeholder-text'], 2);

  assert.equal(await h.run('rework', 'propose', 'pricing', '--json'), 0);
  assert.deepEqual(h.data<{ view: string; slug: string; items: ProtectedItem[] }>(), {
    view: 'propose',
    slug: 'pricing',
    items: [
      { id: 'brand', kind: 'brand', find: 'Acme' },
      { id: 'cta', kind: 'action', find: 'Start free trial' },
      { id: 'price-1', kind: 'price', find: '$49' },
      { id: 'field-1', kind: 'field', find: 'Work email' },
      { id: 'nav-1', kind: 'link', find: 'Docs' },
    ],
  });
  await h.run('rework', 'propose', 'pricing');
  assert.equal(
    h.out.at(-1)?.split('\n')[0],
    t('rework.propose.head', { slug: 'pricing', count: 5 }),
  );
});

test('rework new --image copies the images and is not measured; its proposal is empty', async () => {
  const h = harness();
  const code = await h.run(
    'rework',
    'new',
    'checkout',
    '--image',
    h.file('a.png', PNG),
    '--image',
    h.file('b.png', PNG),
    '--title',
    'Checkout',
  );
  assert.equal(code, 0, h.err.join('\n'));
  assert.equal(
    h.out.at(-1),
    [
      t('rework.new.created', { slug: 'checkout', path: h.draftDir('checkout') }),
      t('rework.new.read', { slug: 'checkout' }),
    ].join('\n'),
  );
  const before = join(h.draftDir('checkout'), 'before');
  assert.ok(existsSync(join(before, 'images', '1.png')));
  assert.ok(existsSync(join(before, 'images', '2.png')));
  const source = JSON.parse(readFileSync(join(before, 'source.json'), 'utf8')) as {
    measured: boolean;
  };
  assert.equal(source.measured, false);
  assert.equal(existsSync(join(before, 'problems.json')), false);
  assert.deepEqual(h.fake.surveys, []);

  assert.equal(await h.run('rework', 'propose', 'checkout', '--json'), 0);
  assert.deepEqual(h.data<{ items: ProtectedItem[] }>().items, []);
  await h.run('rework', 'propose', 'checkout');
  assert.equal(h.out.at(-1), t('rework.propose.empty', { slug: 'checkout' }));
  await h.run('draft', 'show', 'checkout', '--json');
  assert.equal(h.data<{ draft: { title: string } }>().draft.title, 'Checkout');
});

test('rework new --figma-image with --note keeps the note; --kit picks the kit', async () => {
  const h = harness();
  const code = await h.run(
    'rework',
    'new',
    'frame',
    '--figma-image',
    h.file('frame.png', PNG),
    '--note',
    h.file('frame.md', '# Frame\n'),
    '--kit',
    'tiny',
    '--json',
  );
  assert.equal(code, 0, h.err.join('\n'));
  assert.deepEqual(h.data<NewData>().draft.rework, { source: 'figma' });
  assert.equal(readFileSync(join(h.draftDir('frame'), 'before', 'note.md'), 'utf8'), '# Frame\n');
  assert.equal(await h.run('rework', 'new', 'other', '--url', PAGE, '--kit', 'nope', '--json'), 6);
  assert.equal(h.error().code, 'KIT_NOT_FOUND');
});

test('a blocked page and a page that does not load are refused and leave no draft', async () => {
  const blocked = harness(() => ({ state: 'blocked', url: 'http://127.0.0.1/' }));
  assert.equal(
    await blocked.run('rework', 'new', 'local', '--url', 'http://127.0.0.1/', '--json'),
    37,
  );
  assert.equal(blocked.error().code, 'SCAN_BLOCKED');
  assert.equal(existsSync(blocked.draftDir('local')), false);

  const failed = harness(() => ({ state: 'failed', error: 'Timeout 45000ms exceeded' }));
  assert.equal(await failed.run('rework', 'new', 'slow', '--url', PAGE, '--json'), 38);
  assert.equal(failed.error().code, 'SCAN_FAILED');
  assert.equal(existsSync(failed.draftDir('slow')), false);
});

test('one source exactly, a known sub-command and a rework draft for propose', async () => {
  const h = harness();
  const usage = t('error.USAGE', { detail: t('rework.usage.source') });
  for (const argv of [
    ['rework', 'new', 'page'],
    ['rework', 'new', 'page', '--url', PAGE, '--image', h.file('a.png', PNG)],
    ['rework', 'new', 'page', '--url', PAGE, '--url', 'https://example.com/b'],
    ['rework', 'new', 'page', '--figma-image', h.file('f.png', PNG)],
    ['rework', 'new', 'page', '--note', h.file('n.md', '# n\n')],
  ]) {
    assert.equal(await h.run(...argv, '--json'), 2, argv.join(' '));
    assert.deepEqual(h.error(), { code: 'USAGE', message: usage });
  }
  assert.equal(existsSync(h.draftDir('page')), false);
  assert.equal(await h.run('rework', 'nope', '--json'), 2);
  assert.equal(await h.run('rework', '--json'), 2);
  assert.equal(await h.run('rework', 'propose', '--json'), 2);
  assert.equal(await h.run('rework', 'propose', 'missing', '--json'), 9);

  await h.run('draft', 'new', 'plain');
  assert.equal(await h.run('rework', 'propose', 'plain', '--json'), 43);
  assert.equal(h.error().code, 'DRAFT_KIND');
  assert.match(h.error().message, /needs a rework draft/);
});

test('without a workspace rework is refused', async () => {
  const h = harness();
  rmSync(join(h.io.cwd, '.kitvas'), { recursive: true, force: true });
  assert.equal(await h.run('rework', 'new', 'page', '--url', PAGE, '--json'), 13);
  assert.equal(h.error().code, 'WORKSPACE_MISSING');
});
