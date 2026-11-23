import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  type FactNode,
  type InventoryItem,
  type ReworkSourceInput,
  readBefore,
  type StartReworkDeps,
  type StartReworkInput,
  type Survey,
  type SurveyReport,
  startRework,
} from '../../src/checks/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { fakeBrowser, t } from '../helpers/checks.ts';
import { NOW, tempDrafts } from '../helpers/drafts.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import { tempDir } from '../helpers/tmp.ts';
import { node, page, text } from './rules/facts.ts';

const PAGE = 'https://example.com/shop';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

/** `count` paragraphs of template copy: `ux/placeholder-text` once each. */
const lorem = (count: number): FactNode[] =>
  Array.from({ length: count }, (_, index) =>
    node({ tag: 'p', box: [0, index * 30, 300, 24], text: text(`Lorem ipsum ${index}`) }),
  );

const inventoryAt = (width: number): InventoryItem[] => [
  { kind: 'heading', text: 'Shop', level: 1, width, read: 'measured' },
  { kind: 'price', text: '$1,299.00', width, read: 'measured' },
];

/** A survey that writes its shot as the adapter does and measures these nodes. */
function surveyed(options: { nodes?: FactNode[]; viewportMeta?: boolean } = {}) {
  return (input: Survey): SurveyReport => {
    mkdirSync(dirname(input.shot), { recursive: true });
    writeFileSync(input.shot, PNG);
    return {
      state: 'surveyed',
      facts: page(options.nodes ?? [], {
        viewport: [input.width, input.height],
        scrollWidth: input.width,
      }),
      inventory: inventoryAt(input.width),
      viewportMeta: options.viewportMeta ?? true,
    };
  };
}

function setup(survey?: (input: Survey) => SurveyReport) {
  const { store } = tempDrafts();
  const fake = fakeBrowser(undefined, survey);
  const lookups: string[] = [];
  const deps: StartReworkDeps = {
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    browser: fake.browser,
    lookup: async (host) => {
      lookups.push(host);
      return ['93.184.216.34'];
    },
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
    t,
  };
  const folder = tempDir();
  const file = (name: string, bytes: Uint8Array | string): string => {
    const path = join(folder, name);
    writeFileSync(path, bytes);
    return path;
  };
  return { store, deps, fake, lookups, file };
}

const input = (source: ReworkSourceInput): StartReworkInput => ({
  slug: 'shop',
  title: 'Shop',
  kit: 'tiny',
  source,
});

const fromPage = (allowPrivate = false): StartReworkInput =>
  input({ type: 'url', url: PAGE, allowPrivate });

const failsWith =
  (code: string, params: Record<string, string | number> = {}) =>
  (error: unknown): boolean =>
    error instanceof KitvasError &&
    error.code === code &&
    Object.entries(params).every(([key, value]) => error.params[key] === value);

test('a page is surveyed at 390 and 1280: shots, inventory and every problem, uncapped', async () => {
  const s = setup(surveyed({ nodes: lorem(7) }));
  const result = await startRework(s.deps, fromPage());
  const shots = join(s.store.dir('shop'), 'before', 'shots');
  assert.deepEqual(
    s.fake.surveys.map((survey) => [survey.url, survey.width, survey.height, survey.shot]),
    [
      [PAGE, 390, 844, join(shots, '390.png')],
      [PAGE, 1280, 900, join(shots, '1280.png')],
    ],
  );
  assert.equal(s.fake.closed(), 1);
  assert.ok(existsSync(join(shots, '390.png')) && existsSync(join(shots, '1280.png')));

  const before = readBefore(s.store, 'shop');
  assert.deepEqual(before?.source, {
    schemaVersion: 1,
    source: 'url',
    url: PAGE,
    files: [],
    capturedAt: NOW.toISOString(),
    widths: [390, 1280],
    measured: true,
  });
  assert.deepEqual(before?.inventory.items, [...inventoryAt(390), ...inventoryAt(1280)]);
  assert.equal(before?.protected, null);
  // Seven at each width: the per-rule cap of a draft's check does not apply to the original.
  assert.equal(before?.problems?.counts['ux/placeholder-text'], 14);
  const findings = before?.problems?.findings ?? [];
  const total = Object.values(before?.problems?.counts ?? {}).reduce((sum, n) => sum + n, 0);
  assert.equal(total, findings.length);
  const first = findings.find((finding) => finding.rule === 'ux/placeholder-text');
  assert.deepEqual(
    [first?.severity, first?.states, first?.widths, first?.element, first?.file],
    ['fix', ['filled'], [390], null, null],
  );

  assert.deepEqual(result.before, { measured: true, problems: total, inventory: 4 });
  assert.equal(result.path, s.store.dir('shop'));
  assert.equal(result.draft.kind, 'rework');
  assert.deepEqual(result.draft.rework, { source: 'url' });
  assert.equal(result.draft.kit.id, 'tiny');
});

test('the policy refuses private addresses unless the person allows them', async () => {
  const strict = setup(surveyed());
  await startRework(strict.deps, fromPage());
  const policy = strict.fake.surveys[0]?.policy;
  assert.equal(await policy?.(new URL('http://127.0.0.1/')), false);
  assert.equal(await policy?.(new URL('https://cdn.example.com/a.css')), true);
  assert.deepEqual(strict.lookups, ['cdn.example.com']);

  const open = setup(surveyed());
  await startRework(open.deps, fromPage(true));
  assert.equal(await open.fake.surveys[0]?.policy(new URL('http://127.0.0.1/')), true);
});

test('without a viewport meta the phone survey gives ui/no-viewport and none of its findings', async () => {
  const s = setup(surveyed({ nodes: lorem(1), viewportMeta: false }));
  await startRework(s.deps, fromPage());
  const problems = readBefore(s.store, 'shop')?.problems;
  const atPhone = problems?.findings.filter((finding) => finding.widths.includes(390)) ?? [];
  assert.deepEqual(
    atPhone.map((finding) => [finding.check, finding.rule, finding.severity, finding.message]),
    [['ui', 'ui/no-viewport', 'fix', { key: 'checkRule.uiNoViewport', params: {} }]],
  );
  assert.equal(problems?.counts['ui/no-viewport'], 1);
  // The laptop is not a phone: its findings are kept.
  assert.equal(problems?.counts['ux/placeholder-text'], 1);
});

test('a blocked page, a page that does not load or no survey at all leaves no draft', async () => {
  const blocked = setup((shown) =>
    shown.width === 1280 ? { state: 'blocked', url: 'http://10.0.0.5/' } : surveyed()(shown),
  );
  await assert.rejects(
    startRework(blocked.deps, fromPage()),
    failsWith('SCAN_BLOCKED', { url: 'http://10.0.0.5/' }),
  );
  assert.equal(blocked.store.exists('shop'), false);
  assert.equal(blocked.fake.closed(), 1);

  const failed = setup(() => ({ state: 'failed', error: 'net::ERR_NAME_NOT_RESOLVED' }));
  await assert.rejects(
    startRework(failed.deps, fromPage()),
    failsWith('SCAN_FAILED', { url: PAGE, detail: 'net::ERR_NAME_NOT_RESOLVED' }),
  );
  assert.equal(failed.store.exists('shop'), false);

  const none = setup();
  await assert.rejects(startRework(none.deps, fromPage()), failsWith('BROWSER_MISSING'));
  assert.equal(none.store.exists('shop'), false);
  assert.equal(none.fake.closed(), 1);
});

test('images are copied as 1.png, 2.jpg; the original is not measured and no browser opens', async () => {
  const s = setup();
  const images = [s.file('home.png', PNG), s.file('menu.jpeg', JPEG)];
  const result = await startRework(s.deps, input({ type: 'image', images }));
  assert.deepEqual(result.before, { measured: false, problems: 0, inventory: 0 });
  assert.deepEqual(result.draft.rework, { source: 'image' });
  const dir = join(result.path, 'before');
  assert.deepEqual([...readFileSync(join(dir, 'images', '1.png'))], [...PNG]);
  assert.deepEqual([...readFileSync(join(dir, 'images', '2.jpg'))], [...JPEG]);
  assert.deepEqual(readBefore(s.store, 'shop'), {
    source: {
      schemaVersion: 1,
      source: 'image',
      url: null,
      files: ['1.png', '2.jpg'],
      capturedAt: NOW.toISOString(),
      widths: [],
      measured: false,
    },
    inventory: { items: [] },
    problems: null,
    protected: null,
  });
  assert.equal(existsSync(join(dir, 'note.md')), false);
  assert.equal(s.fake.closed(), 0);
});

test('a Figma frame is its image and the structure note', async () => {
  const s = setup();
  const note = '# Checkout\n\n- Header with the logo\n';
  const result = await startRework(
    s.deps,
    input({ type: 'figma', image: s.file('frame.webp', WEBP), note: s.file('frame.md', note) }),
  );
  assert.equal(readFileSync(join(result.path, 'before', 'note.md'), 'utf8'), note);
  const source = readBefore(s.store, 'shop')?.source;
  assert.deepEqual([source?.source, source?.files, source?.measured], ['figma', ['1.webp'], false]);
  assert.deepEqual(result.draft.rework, { source: 'figma' });
});

test('a bad source is a usage error, checked before the draft is made', async () => {
  const s = setup(surveyed());
  const notImage = s.file('notes.txt', 'not an image');
  const binary = s.file('bin.md', JPEG);
  const missing = join(tempDir(), 'missing.png');
  const bad: [ReworkSourceInput, string][] = [
    [{ type: 'image', images: [notImage] }, t('rework.new.badImage', { file: notImage })],
    [{ type: 'image', images: [missing] }, t('rework.new.badImage', { file: missing })],
    [{ type: 'image', images: [] }, t('rework.usage.source')],
    [
      { type: 'url', url: 'ftp://example.com/', allowPrivate: false },
      t('rework.new.badUrl', { url: 'ftp://example.com/' }),
    ],
    [
      { type: 'figma', image: s.file('frame.png', PNG), note: missing },
      t('rework.new.badNote', { file: missing }),
    ],
    [
      { type: 'figma', image: s.file('frame2.png', PNG), note: binary },
      t('rework.new.badNote', { file: binary }),
    ],
  ];
  for (const [source, detail] of bad) {
    await assert.rejects(startRework(s.deps, input(source)), failsWith('USAGE', { detail }));
    assert.equal(s.store.exists('shop'), false);
  }
  assert.deepEqual(s.fake.surveys, []);
});

test('a taken slug and an unknown kit are refused before any survey', async () => {
  const s = setup(surveyed());
  await startRework(s.deps, fromPage());
  await assert.rejects(startRework(s.deps, fromPage()), failsWith('DRAFT_EXISTS'));
  await assert.rejects(
    startRework(s.deps, { ...fromPage(), slug: 'other', kit: 'nope' }),
    failsWith('KIT_NOT_FOUND'),
  );
  await assert.rejects(
    startRework(s.deps, { ...fromPage(), slug: 'Not A Slug' }),
    failsWith('DRAFT_INVALID'),
  );
  assert.equal(s.store.exists('other'), false);
  assert.equal(s.fake.surveys.length, 2);
});
