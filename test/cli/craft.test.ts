import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { startCraft } from '../../src/checks/app/start-craft.ts';
import type { Browser, BrowserSession, Survey, SurveyReport } from '../../src/checks/index.ts';
import { createCraftCommand, createDraftCommand, runCli } from '../../src/cli/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft } from '../../src/drafts/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import type { KitComponent, KitWriter } from '../../src/kit/index.ts';
import { categoryOf, craftEntry, renameExport, requireKit } from '../../src/kit/index.ts';
import { initWorkspace, KitvasError, PLUGIN_ROOT, workspaceDir } from '../../src/shared/index.ts';
import { page } from '../checks/rules/facts.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { tempDir } from '../helpers/tmp.ts';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const SKETCH_B = [
  'export interface BadgeProps {',
  "  tone?: 'info' | 'warn';",
  '  label: string;',
  '  onPick?: () => void;',
  '}',
  'export function SketchB(props: BadgeProps) {',
  '  return <b>{props.label}</b>;',
  '}',
  '',
].join('\n');

type Addition = {
  id: string;
  component: KitComponent;
  files: { path: string; text: string }[];
  replace: boolean;
};

function harness(options: { survey?: (input: Survey) => SurveyReport } = {}) {
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
  writeFileSync(join(io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  const deps = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
  };
  const additions: Addition[] = [];
  const exported: { dir: string; files: { path: string; text: string }[] }[] = [];
  const kitWriter: KitWriter = {
    readText: () => undefined,
    writeText: () => undefined,
    writeBytes: () => undefined,
    remove: () => undefined,
    writeAddition: (id, component, files, replace) => {
      additions.push({ id, component, files, replace });
    },
    exportFiles: (dir, files) => {
      exported.push({ dir, files });
    },
  };
  const surveys: Survey[] = [];
  const session: BrowserSession = {
    name: 'fake',
    visit: () => Promise.reject(new Error('unused')),
    survey: (input) => {
      surveys.push(input);
      const report = options.survey?.(input) ?? {
        state: 'surveyed' as const,
        facts: page([]),
        inventory: [],
        viewportMeta: true,
      };
      if (report.state === 'surveyed') {
        mkdirSync(dirname(input.shot), { recursive: true });
        writeFileSync(input.shot, PNG);
      }
      return Promise.resolve(report);
    },
    close: () => Promise.resolve(),
  };
  const browser: Browser = { open: () => Promise.resolve(session) };
  const commands = [
    createDraftCommand(deps),
    createCraftCommand({
      ...deps,
      kitWriter,
      start: (project, input, t) =>
        startCraft(
          {
            drafts: deps.draftsAt(project),
            kits: deps.kits,
            browser,
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
            now: () => new Date('2026-11-23T10:00:00.000Z'),
            t,
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
  const sketch = (slug: string, version: number, name: string) =>
    join(draftDir(slug), `v${version}`, 'src', 'tsx', 'sketches', `${name}.tsx`);
  const image = (name: string, bytes: Uint8Array = PNG) => {
    const path = join(io.cwd, name);
    writeFileSync(path, bytes);
    return path;
  };
  return {
    out,
    err,
    io,
    deps,
    run,
    data,
    error,
    draftDir,
    sketch,
    image,
    additions,
    exported,
    surveys,
  };
}

const NEW = ['craft', 'new', 'badge', '--subject', 'component', '--name', 'Badge'] as const;

async function started(h: ReturnType<typeof harness>, ...extra: string[]) {
  const code = await h.run(...NEW, '--description', 'A small status badge', ...extra, '--json');
  assert.equal(code, 0, h.err.join('\n'));
}

test('craft new copies the images and records the reference', async () => {
  const h = harness();
  await started(h, '--image', h.image('one.png'), '--image', h.image('two.png'));
  const created = h.data<{
    draft: { kind: string; craft: { subject: string; name: string; picked: null } };
    reference: { source: string; images: number; shots: number };
  }>();
  assert.equal(created.draft.kind, 'craft');
  assert.equal(created.draft.craft.name, 'Badge');
  assert.equal(created.draft.craft.picked, null);
  assert.deepEqual(created.reference, { source: 'image', images: 2, shots: 0 });
  const root = h.draftDir('badge');
  assert.ok(existsSync(join(root, 'reference', 'images', '1.png')));
  assert.ok(existsSync(join(root, 'reference', 'images', '2.png')));
  const source = JSON.parse(readFileSync(join(root, 'reference', 'source.json'), 'utf8')) as {
    source: string;
    files: string[];
    measured: boolean;
    url: string | null;
    widths: number[];
  };
  assert.deepEqual(source.files, ['1.png', '2.png']);
  assert.equal(source.measured, false);
  assert.equal(source.url, null);
  assert.deepEqual(source.widths, []);
  for (const name of ['A', 'B', 'C']) assert.ok(existsSync(h.sketch('badge', 1, name)));
});

test('craft new --url shoots the page at 390 and 1280', async () => {
  const h = harness();
  await started(h, '--url', 'https://example.com/badge');
  assert.deepEqual(
    h.surveys.map((survey) => survey.width),
    [390, 1280],
  );
  const root = h.draftDir('badge');
  assert.ok(existsSync(join(root, 'reference', 'shots', '390.png')));
  assert.ok(existsSync(join(root, 'reference', 'shots', '1280.png')));
  const source = JSON.parse(readFileSync(join(root, 'reference', 'source.json'), 'utf8')) as {
    source: string;
    url: string;
    measured: boolean;
    widths: number[];
  };
  assert.equal(source.source, 'url');
  assert.equal(source.url, 'https://example.com/badge');
  assert.equal(source.measured, false);
  assert.deepEqual(source.widths, [390, 1280]);
});

test('craft new without an example writes no reference folder', async () => {
  const h = harness();
  await started(h);
  assert.deepEqual(h.data<{ reference: unknown }>().reference, {
    source: null,
    images: 0,
    shots: 0,
  });
  assert.equal(existsSync(join(h.draftDir('badge'), 'reference')), false);
  assert.equal(h.surveys.length, 0);
});

test('craft new refuses a blocked page, a bad image and missing flags', async () => {
  const blocked = harness({ survey: (input) => ({ state: 'blocked', url: input.url }) });
  assert.equal(
    await blocked.run(...NEW, '--description', 'x', '--url', 'http://127.0.0.1/', '--json'),
    37,
  );
  assert.equal(blocked.error().code, 'SCAN_BLOCKED');

  const h = harness();
  const text = h.image('notes.txt', new TextEncoder().encode('not an image'));
  assert.equal(await h.run(...NEW, '--description', 'x', '--image', text, '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
  assert.match(h.error().message, /not a readable PNG, JPEG or WebP/);
  assert.equal(existsSync(h.draftDir('badge')), false);

  assert.equal(await h.run('craft', 'new', 'badge', '--json'), 2);
  assert.match(h.error().message, /--subject/);
  assert.equal(await h.run('craft', 'new', 'badge', '--subject', 'icon', '--json'), 2);
  assert.match(h.error().message, /--name/);
  assert.equal(
    await h.run('craft', 'new', 'badge', '--subject', 'icon', '--name', 'B', '--json'),
    2,
  );
  assert.match(h.error().message, /--description/);
  assert.equal(await h.run('craft', 'nope', '--json'), 2);
});

test('pick keeps one sketch in the next version and sets picked', async () => {
  const h = harness();
  await started(h);
  writeFileSync(h.sketch('badge', 1, 'B'), SKETCH_B);
  assert.equal(await h.run('craft', 'pick', 'badge', 'B', '--json'), 0);
  assert.deepEqual(h.data(), { view: 'pick', slug: 'badge', picked: 'B', version: 2 });
  assert.equal(readFileSync(h.sketch('badge', 2, 'B'), 'utf8'), SKETCH_B);
  assert.equal(existsSync(h.sketch('badge', 2, 'A')), false);
  assert.equal(existsSync(h.sketch('badge', 2, 'C')), false);
  await h.run('draft', 'show', 'badge', '--json');
  assert.equal(h.data<{ draft: { craft: { picked: string } } }>().draft.craft.picked, 'B');
});

test('pick refuses a rework draft, a screen draft and an unknown sketch', async () => {
  const h = harness();
  await h.run('draft', 'new', 'plain');
  assert.equal(await h.run('craft', 'pick', 'plain', 'B', '--json'), 43);
  assert.equal(h.error().code, 'DRAFT_KIND');
  assert.match(h.error().message, /needs a craft draft/);

  const { kit } = requireKit(h.deps.kits, 'tiny');
  createDraft(h.deps.draftsAt(h.io.cwd), {
    slug: 'old-page',
    title: 'Old page',
    kit: { id: kit.id, version: kit.version, hash: 'a'.repeat(64) },
    now: new Date(),
    kind: 'rework',
    rework: { source: 'url' },
  });
  assert.equal(await h.run('craft', 'pick', 'old-page', 'A', '--json'), 43);
  assert.equal(h.error().code, 'DRAFT_KIND');
  assert.equal(await h.run('craft', 'add', 'old-page', '--json'), 43);

  await started(h);
  assert.equal(await h.run('craft', 'pick', 'badge', 'D', '--json'), 44);
  assert.equal(h.error().code, 'SKETCH_UNKNOWN');
  assert.equal(await h.run('craft', 'pick', 'badge', '--json'), 2);
  assert.equal(await h.run('craft', 'pick', 'missing', 'A', '--json'), 9);
});

test('add before a pick fails; after it the entry goes to the kit writer', async () => {
  const h = harness();
  await started(h);
  assert.equal(await h.run('craft', 'add', 'badge', '--json'), 46);
  assert.equal(h.error().code, 'SKETCH_NOT_PICKED');
  assert.equal(h.additions.length, 0);

  writeFileSync(h.sketch('badge', 1, 'B'), SKETCH_B);
  await h.run('craft', 'pick', 'badge', 'B', '--json');
  assert.equal(await h.run('craft', 'add', 'badge', '--json'), 0);
  assert.deepEqual(h.data(), {
    view: 'add',
    kit: 'tiny',
    name: 'Badge',
    files: ['components/Badge.tsx'],
  });
  const [added] = h.additions;
  assert.equal(added?.id, 'tiny');
  assert.equal(added?.replace, false);
  assert.equal(added?.component.name, 'Badge');
  assert.equal(added?.component.description, 'A small status badge');
  assert.equal(added?.files[0]?.path, 'components/Badge.tsx');
  assert.match(added?.files[0]?.text ?? '', /export function Badge\(props: BadgeProps\)/);
  assert.doesNotMatch(added?.files[0]?.text ?? '', /SketchB/);
});

test('add passes --replace through', async () => {
  const h = harness();
  await started(h);
  writeFileSync(h.sketch('badge', 1, 'A'), SKETCH_B);
  await h.run('craft', 'pick', 'badge', 'A', '--json');
  assert.equal(await h.run('craft', 'add', 'badge', '--replace', '--json'), 0);
  assert.equal(h.additions.at(-1)?.replace, true);
  assert.equal(await h.run('craft', 'add', 'badge', '--json'), 0);
  assert.equal(h.additions.at(-1)?.replace, false);
});

test('export writes the component and a README to the folder', async () => {
  const h = harness();
  await started(h);
  assert.equal(await h.run('craft', 'export', 'badge', '--to', 'out', '--json'), 46);
  writeFileSync(h.sketch('badge', 1, 'C'), SKETCH_B);
  await h.run('craft', 'pick', 'badge', 'C', '--json');
  assert.equal(await h.run('craft', 'export', 'badge', '--json'), 2);
  assert.equal(await h.run('craft', 'export', 'badge', '--to', 'out', '--json'), 0);
  assert.deepEqual(h.data<{ files: string[] }>().files, ['Badge.tsx', 'README.md']);
  const [written] = h.exported;
  assert.equal(written?.dir, join(h.io.cwd, 'out'));
  assert.deepEqual(
    written?.files.map((file) => file.path),
    ['Badge.tsx', 'README.md'],
  );
  assert.match(written?.files[1]?.text ?? '', /^# Badge\n\nA small status badge/);
  assert.match(written?.files[0]?.text ?? '', /export function Badge/);
  await h.run('craft', 'export', 'badge', '--to', 'out');
  assert.equal(h.out.at(-1), `Wrote Badge.tsx, README.md to ${join(h.io.cwd, 'out')}.`);
});

test('the catalog entry of an icon', () => {
  const entry = craftEntry({
    kit: 'tiny',
    subject: 'icon',
    name: 'Cart',
    description: 'A shopping cart',
    text: 'export function SketchA() { return <svg />; }',
  });
  assert.equal(entry.category, 'icon');
  assert.deepEqual(
    entry.props.map((prop) => prop.name),
    ['size', 'title'],
  );
  assert.deepEqual(entry.import, { from: 'components/Cart', name: 'Cart' });
  assert.deepEqual(entry.examples, [
    { title: 'Default', code: '<Cart size={24} />', imports: ['Cart'] },
  ]);
});

test('the catalog entry of a logo', () => {
  const entry = craftEntry({
    kit: 'tiny',
    subject: 'logo',
    name: 'Mark',
    description: 'The mark',
    text: 'export const SketchB = () => <svg />;',
  });
  assert.equal(entry.category, 'display');
  assert.deepEqual(
    entry.props.map((prop) => prop.name),
    ['size', 'title', 'tone'],
  );
  assert.deepEqual(entry.props[2]?.values, ['colour', 'mono']);
  assert.equal(entry.examples[0]?.code, '<Mark size={32} tone="mono" />');
});

test('the catalog entry of a component reads its props type', () => {
  const entry = craftEntry({
    kit: 'tiny',
    subject: 'component',
    name: 'Badge',
    description: 'A badge',
    text: SKETCH_B,
  });
  assert.equal(entry.category, 'display');
  assert.deepEqual(entry.props, [
    { name: 'tone', type: 'enum', values: ['info', 'warn'] },
    { name: 'label', type: 'string', required: true },
    { name: 'onPick', type: 'callback' },
  ]);
  assert.equal(entry.examples[0]?.code, '<Badge label="Text" />');
  const bare = craftEntry({
    kit: 'tiny',
    subject: 'component',
    name: 'Plain',
    description: 'No props',
    text: 'export function SketchC() { return <div />; }',
  });
  assert.deepEqual(bare.props, []);
  assert.equal(bare.examples[0]?.code, '<Plain />');
});

test('renameExport renames the export and refuses a file without one', () => {
  assert.equal(
    renameExport('export function SketchA() {}\n', 'Cart'),
    'export function Cart() {}\n',
  );
  assert.equal(
    renameExport('export default function SketchA() {}\n', 'Cart'),
    'export function Cart() {}\n',
  );
  assert.equal(
    renameExport('export const Cart = () => null;\n', 'Cart'),
    'export const Cart = () => null;\n',
  );
  assert.throws(() => renameExport('const x = 1;\n', 'Cart'), { code: 'ADDITION_INVALID' });
});

test('--category picks the category of a crafted component; an unknown one is a usage error', () => {
  const final = {
    kit: 'tiny',
    subject: 'component' as const,
    name: 'Badge',
    description: 'A badge',
    text: SKETCH_B,
  };
  assert.equal(craftEntry(final, categoryOf('feedback')).category, 'feedback');
  assert.equal(categoryOf(undefined), 'display');
  assert.throws(
    () => categoryOf('brand'),
    (error: unknown) => error instanceof KitvasError && error.code === 'USAGE',
  );
  assert.equal(craftEntry({ ...final, subject: 'icon' }, categoryOf('feedback')).category, 'icon');
});
