import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type Browser,
  type BrowserSession,
  type Scan,
  type ScanFacts,
  type ScanReport,
  scanKit,
} from '../../src/checks/index.ts';
import type { KitStore, KitWriter } from '../../src/kit/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';

const KIT_DIR = join('kits', 'site');
const FIRST = 'https://example.com/';

function webKit(urls: string[] = [FIRST]): Record<string, unknown> {
  const json = tinyKitJson();
  json.id = 'site';
  json.source = { type: 'web', urls };
  return json;
}

const facts = (url: string, width: number, candidates = 1): ScanFacts => ({
  schemaVersion: 1,
  url,
  width,
  title: { pageText: 'Home' },
  colours: [],
  families: [],
  type: [],
  roles: [],
  spacing: [],
  radii: [],
  shadows: [],
  borders: [],
  rootVars: [],
  breakpoints: [],
  overlays: [],
  candidates: Array.from({ length: candidates }, (_, index) => ({
    id: `button-${index}`,
    kind: 'button' as const,
    box: [0, 0, 10, 10] as [number, number, number, number],
    crop: `crops/button-${index}.png`,
    text: { pageText: 'Save' },
    style: {},
    overlay: false,
  })),
});

type Shop = {
  deps: Parameters<typeof scanKit>[0];
  writes: Record<string, string>;
  removed: string[];
  scans: Scan[];
  closed: () => number;
  lookups: string[];
};

/** A kit in memory and a browser whose scans are answered by `answer`; `candidates` per page. */
function shop(
  kitJson: unknown,
  answer: (input: Scan) => ScanReport | undefined = (input) => ({
    state: 'scanned',
    facts: facts(input.url, input.width),
  }),
  options: { scan?: boolean } = {},
): Shop {
  const writes: Record<string, string> = {};
  const removed: string[] = [];
  const scans: Scan[] = [];
  const lookups: string[] = [];
  let closed = 0;
  const kits: KitStore = {
    list: () => ['site'],
    read: (id) => (id === 'site' ? { id, dir: KIT_DIR, kitJson, project: 'p' } : undefined),
    readJson: () => undefined,
    exists: () => false,
  };
  const kitWriter: KitWriter = {
    readText: () => undefined,
    writeText: (_id, relPath, text) => {
      writes[relPath] = text;
    },
    writeBytes: () => {},
    remove: (_id, relPath) => {
      removed.push(relPath);
    },
    writeAddition: () => {},
    exportFiles: () => {},
  };
  const session: BrowserSession = {
    name: 'fake',
    async visit() {
      throw new Error('never visited');
    },
    ...(options.scan === false
      ? {}
      : {
          async scan(input: Scan) {
            scans.push(input);
            return answer(input) ?? { state: 'failed' as const, error: 'no answer' };
          },
        }),
    async close() {
      closed += 1;
    },
  };
  const browser: Browser = { open: async () => session };
  return {
    deps: {
      kits,
      kitWriter,
      browser,
      lookup: async (host) => {
        lookups.push(host);
        return ['93.184.216.34'];
      },
    },
    writes,
    removed,
    scans,
    closed: () => closed,
    lookups,
  };
}

const failsWith =
  (code: string, params: Record<string, string | number> = {}) =>
  (error: unknown): boolean =>
    error instanceof KitvasError &&
    error.code === code &&
    Object.entries(params).every(([key, value]) => error.params[key] === value);

test('the pages are scanned at both widths, one folder each, and the facts are written', async () => {
  const kit = shop(webKit());
  const result = await scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false });
  assert.deepEqual(result, {
    id: 'site',
    pages: [
      { url: FIRST, width: 1280, folder: 'source/web/1-1280', candidates: 1 },
      { url: FIRST, width: 390, folder: 'source/web/1-390', candidates: 1 },
    ],
  });
  assert.deepEqual(kit.removed, ['source/web/1-1280', 'source/web/1-390']);
  assert.deepEqual(
    kit.scans.map((scan) => [scan.url, scan.width, scan.out]),
    [
      [FIRST, 1280, join(KIT_DIR, 'source', 'web', '1-1280')],
      [FIRST, 390, join(KIT_DIR, 'source', 'web', '1-390')],
    ],
  );
  assert.deepEqual(Object.keys(kit.writes), [
    'source/web/1-1280/facts.json',
    'source/web/1-390/facts.json',
  ]);
  const written = JSON.parse(kit.writes['source/web/1-390/facts.json'] ?? '') as ScanFacts;
  assert.deepEqual(written, facts(FIRST, 390));
  assert.ok(
    (kit.writes['source/web/1-390/facts.json'] ?? '').startsWith('{\n  "schemaVersion": 1'),
  );
  // The session is closed and kit.json is left alone: no URL was added.
  assert.equal(kit.closed(), 1);
  assert.equal('kit.json' in kit.writes, false);
});

test('given URLs are added in order without repeats and kit.json is written back as it was', async () => {
  const second = 'https://example.org/pricing';
  const kit = shop(webKit());
  const result = await scanKit(kit.deps, 'p', 'site', {
    urls: [second, FIRST, second],
    allowPrivate: false,
  });
  assert.deepEqual(
    result.pages.map((page) => [page.url, page.folder]),
    [
      [FIRST, 'source/web/1-1280'],
      [FIRST, 'source/web/1-390'],
      [second, 'source/web/2-1280'],
      [second, 'source/web/2-390'],
    ],
  );
  const text = kit.writes['kit.json'] ?? '';
  assert.ok(text.endsWith('}\n'));
  const expected = webKit([FIRST, second]);
  assert.deepEqual(JSON.parse(text), expected);
  assert.equal(text, `${JSON.stringify(expected, null, 2)}\n`);
});

test('with URLs given, only those pages are scanned, in the folders of their place in the kit', async () => {
  const second = 'https://example.org/pricing';
  const kit = shop(webKit());
  const result = await scanKit(kit.deps, 'p', 'site', { urls: [second], allowPrivate: false });
  assert.deepEqual(
    result.pages.map((page) => [page.url, page.folder]),
    [
      [second, 'source/web/2-1280'],
      [second, 'source/web/2-390'],
    ],
  );
  assert.deepEqual(JSON.parse(kit.writes['kit.json'] ?? ''), webKit([FIRST, second]));
});

test('a kit just made by kit new, with no components yet, can be scanned', async () => {
  const skeleton = { ...webKit(), components: [] };
  const kit = shop(skeleton);
  const result = await scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false });
  assert.equal(result.pages.length, 2);
});

test('the policy handed to the browser refuses private addresses unless the person allows them', async () => {
  const strict = shop(webKit());
  await scanKit(strict.deps, 'p', 'site', { urls: [], allowPrivate: false });
  const policy = strict.scans[0]?.policy;
  assert.equal(await policy?.(new URL('http://127.0.0.1/')), false);
  assert.equal(await policy?.(new URL('https://public.example/a.css')), true);
  // One lookup for the host, though the policy was asked twice over the run.
  await policy?.(new URL('https://public.example/b.css'));
  assert.deepEqual(strict.lookups, ['public.example']);

  const open = shop(webKit());
  await scanKit(open.deps, 'p', 'site', { urls: [], allowPrivate: true });
  assert.equal(await open.scans[0]?.policy(new URL('http://127.0.0.1/')), true);
});

test('a kit that is not a web kit, a bad URL or a sixth page is refused before any scan', async () => {
  const builtin = shop(tinyKitJson());
  await assert.rejects(
    scanKit(builtin.deps, 'p', 'site', { urls: [], allowPrivate: false }),
    failsWith('KIT_SOURCE_INVALID'),
  );
  const bad = shop(webKit());
  await assert.rejects(
    scanKit(bad.deps, 'p', 'site', { urls: ['ftp://example.com/'], allowPrivate: false }),
    failsWith('KIT_SOURCE_INVALID'),
  );
  const many = shop(webKit());
  const five = Array.from({ length: 5 }, (_, index) => `https://example.com/${index}`);
  await assert.rejects(
    scanKit(many.deps, 'p', 'site', { urls: five, allowPrivate: false }),
    failsWith('KIT_SOURCE_INVALID'),
  );
  for (const attempt of [builtin, bad, many]) {
    assert.deepEqual(attempt.scans, []);
    assert.deepEqual(attempt.writes, {});
    assert.equal(attempt.closed(), 0);
  }
  const none = shop(webKit());
  await assert.rejects(
    scanKit(none.deps, 'p', 'nope', { urls: [], allowPrivate: false }),
    failsWith('KIT_NOT_FOUND'),
  );
});

test('a blocked page is SCAN_BLOCKED with the address that was refused, and the browser is closed', async () => {
  const kit = shop(webKit(), () => ({ state: 'blocked', url: 'http://10.0.0.5/admin' }));
  await assert.rejects(
    scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false }),
    failsWith('SCAN_BLOCKED', { url: 'http://10.0.0.5/admin' }),
  );
  assert.equal(kit.closed(), 1);
  assert.deepEqual(kit.writes, {});
});

test('a page that does not load is SCAN_FAILED with the reason', async () => {
  const kit = shop(webKit(), () => ({ state: 'failed', error: 'Timeout 45000ms exceeded' }));
  await assert.rejects(
    scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false }),
    failsWith('SCAN_FAILED', { url: FIRST, detail: 'Timeout 45000ms exceeded' }),
  );
  assert.equal(kit.closed(), 1);
});

test('facts of the wrong shape are SCAN_FAILED and never written', async () => {
  const odd = { ...facts(FIRST, 1280), extra: 'a key kitvas does not know' };
  const kit = shop(webKit(), () => ({ state: 'scanned', facts: odd }));
  await assert.rejects(
    scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false }),
    failsWith('SCAN_FAILED', { url: FIRST }),
  );
  assert.deepEqual(kit.writes, {});
});

test('a page with no candidates still writes its facts and says so', async () => {
  const kit = shop(webKit(), (input) => ({
    state: 'scanned',
    facts: facts(input.url, input.width, 0),
  }));
  const result = await scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false });
  assert.deepEqual(
    result.pages.map((page) => page.candidates),
    [0, 0],
  );
  const written = JSON.parse(kit.writes['source/web/1-1280/facts.json'] ?? '') as ScanFacts;
  assert.deepEqual(written.candidates, []);
});

test('a browser that cannot scan is BROWSER_MISSING and is closed', async () => {
  const kit = shop(webKit(), undefined, { scan: false });
  await assert.rejects(
    scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false }),
    failsWith('BROWSER_MISSING'),
  );
  assert.equal(kit.closed(), 1);
});

test('the crops of a kit stop at 300: later candidates are dropped from the facts and the folder', async () => {
  const urls = [FIRST, 'https://example.org/'];
  const kit = shop(webKit(urls), (input) => ({
    state: 'scanned',
    facts: facts(input.url, input.width, 96),
  }));
  const result = await scanKit(kit.deps, 'p', 'site', { urls: [], allowPrivate: false });
  assert.deepEqual(
    result.pages.map((page) => page.candidates),
    [96, 96, 96, 12],
  );
  const last = JSON.parse(kit.writes['source/web/2-390/facts.json'] ?? '') as ScanFacts;
  assert.equal(last.candidates.length, 12);
  const crops = kit.removed.filter((path) => path.includes('/crops/'));
  assert.equal(crops.length, 84);
  assert.equal(crops[0], 'source/web/2-390/crops/button-12.png');
});
