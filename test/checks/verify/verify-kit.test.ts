import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type Browser,
  readVerifyFile,
  type TypeChecker,
  VERIFY_FILE,
  type VerifyDeps,
  verifyKit,
} from '../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { loadKit } from '../../../src/kit/index.ts';
import { createNodeBuildFs } from '../../../src/render/adapters/node-build-fs.ts';
import { catalogDir, KitvasError } from '../../../src/shared/index.ts';
import { copyKit, FIXTURE_KITS } from '../../helpers/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';
import {
  bundleError,
  type FakeBundler,
  fakeBrowser,
  fakeBundler,
  fakeChecker,
  lineOf,
  tscMessage,
} from './support.ts';

const AT = '2026-11-23T10:00:00.000Z';

type Options = {
  kitsRoot?: string;
  bundler?: FakeBundler;
  types?: TypeChecker;
  browser?: Browser;
};

/** A temp project and the deps of `verifyKit` with fakes for every tool; the disk is real. */
function workshop(options: Options = {}) {
  const project = tempDir('kitvas-verify-');
  const bundler = options.bundler ?? fakeBundler();
  const deps: VerifyDeps = {
    kits: createFolderKitStore(options.kitsRoot ?? FIXTURE_KITS),
    kitWriter: {
      readText: () => undefined,
      writeText: () => {},
      writeBytes: () => {},
      remove: () => {},
      writeAddition: () => {},
      exportFiles: () => {},
    },
    projectFiles: () => {
      throw new Error('a built-in kit has no project to look at');
    },
    render: {
      bundler,
      styles: { compile: async () => ({ css: '', errors: [] }), dispose: async () => {} },
      fs: createNodeBuildFs(),
      runtimeFiles: [],
      utility: {
        build: async () => ({ css: '', unknown: [], errors: [], files: [] }),
        dispose: async () => {},
      },
    },
    types: options.types ?? fakeChecker(),
    browser: options.browser,
    now: () => new Date(AT),
  };
  const saved = (kitId: string) => {
    const file = join(catalogDir(project, kitId), VERIFY_FILE);
    return readVerifyFile(existsSync(file) ? readFileSync(file, 'utf8') : undefined);
  };
  return { project, deps, bundler, saved };
}

const tinyHash = (): string => loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny').hash;

test('without a browser the first three steps run and the answer says what was skipped', async () => {
  const shop = workshop();
  const file = await verifyKit(shop.deps, 'tiny', shop.project);
  assert.deepEqual(file, {
    schemaVersion: 2,
    kit: 'tiny',
    hash: tinyHash(),
    at: AT,
    valid: true,
    steps: {
      schema: 'passed',
      imports: 'passed',
      types: 'passed',
      render: 'skipped',
      tokens: 'skipped',
      look: 'skipped',
    },
    issues: [],
    notes: ['kits.verify.noBrowser'],
  });
  assert.deepEqual(shop.saved('tiny'), file);
  // Nothing was built for a browser that is not there: only the import probe was bundled.
  assert.deepEqual(
    shop.bundler.bundles.map((input) => input.entry.name),
    ['kitvas-imports.ts'],
  );
  assert.equal(shop.bundler.bundles[0]?.workingDir, catalogDir(shop.project, 'tiny'));
  assert.ok(existsSync(catalogDir(shop.project, 'tiny')), 'the tools get a folder that exists');
});

test('with a browser all steps run: one build, one session, every example opened', async () => {
  const browser = fakeBrowser();
  const shop = workshop({ browser });
  const file = await verifyKit(shop.deps, 'tiny', shop.project);
  assert.deepEqual(file.steps, {
    schema: 'passed',
    imports: 'passed',
    types: 'passed',
    render: 'passed',
    // The tiny kit maps no token onto a variable, and it is not a written kit.
    tokens: 'skipped',
    look: 'skipped',
  });
  assert.equal(file.valid, true);
  assert.deepEqual(file.issues, []);
  assert.deepEqual(file.notes, ['kits.verify.noTokenMap', 'kits.verify.notWritten']);
  assert.deepEqual([browser.opened, browser.closed], [1, 1]);
  assert.deepEqual(browser.asked, [
    {
      page: join(catalogDir(shop.project, 'tiny'), 'build', 'html', 'index.html'),
      search: '?example=Button.1',
      width: 1280,
      height: 800,
      vars: [],
    },
  ]);
  assert.deepEqual(
    shop.bundler.bundles.map((input) => input.entry.name),
    ['kitvas-imports.ts', 'kitvas-catalog.tsx'],
  );
  assert.deepEqual(shop.saved('tiny'), file);
});

test('a kit that fails schema is not looked at any further', async () => {
  const browser = fakeBrowser();
  const shop = workshop({ kitsRoot: copyKit('tiny', 'other'), browser });
  const file = await verifyKit(shop.deps, 'other', shop.project);
  assert.deepEqual(file, {
    schemaVersion: 2,
    kit: 'other',
    hash: file.hash,
    at: AT,
    valid: false,
    steps: {
      schema: 'failed',
      imports: 'skipped',
      types: 'skipped',
      render: 'skipped',
      tokens: 'skipped',
      look: 'skipped',
    },
    issues: [
      {
        step: 'schema',
        path: 'id',
        key: 'kitIssue.idMismatch',
        params: { id: 'tiny', folder: 'other' },
      },
    ],
    notes: ['kits.verify.afterSchema'],
  });
  assert.match(file.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(shop.bundler.bundles, []);
  assert.equal(browser.opened, 0);
  assert.deepEqual(shop.saved('other'), file);
});

test('a kit.json the contract refuses gets an answer without a hash', async () => {
  const shop = workshop();
  const file = await verifyKit(shop.deps, 'broken', shop.project);
  assert.equal(file.valid, false);
  assert.equal(file.hash, '');
  assert.equal(file.steps.schema, 'failed');
  assert.deepEqual(
    file.issues.map((issue) => [issue.step, issue.key, issue.params.id]),
    [['schema', 'error.KIT_INVALID', 'broken']],
  );
  assert.deepEqual(shop.saved('broken'), file);
});

test('a kit that is not there throws and leaves no file', async () => {
  const shop = workshop();
  await assert.rejects(
    verifyKit(shop.deps, 'nope', shop.project),
    (error: unknown) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
  assert.equal(existsSync(catalogDir(shop.project, 'nope')), false);
});

test('failed steps make the kit invalid; the later steps still run', async () => {
  const browser = fakeBrowser({ '?example=Button.1': { example: 'failed' } });
  const types = fakeChecker((input) => {
    const text = readFileSync(input.entry, 'utf8');
    return [
      tscMessage('build/json/kit-types.tsx', lineOf(text, 'variant={"plain"}'), 'Not a variant.'),
    ];
  });
  const shop = workshop({ browser, types });
  const file = await verifyKit(shop.deps, 'tiny', shop.project);
  assert.equal(file.valid, false);
  assert.deepEqual(file.steps, {
    schema: 'passed',
    imports: 'passed',
    types: 'failed',
    render: 'failed',
    tokens: 'skipped',
    look: 'skipped',
  });
  assert.deepEqual(file.issues, [
    {
      step: 'types',
      path: 'components.0.props.0',
      key: 'kitIssue.propRejected',
      params: { component: 'Button', prop: 'variant', value: 'plain', detail: 'Not a variant.' },
    },
    {
      step: 'render',
      path: 'components.0.examples.0',
      key: 'kitIssue.exampleNotShown',
      params: { key: 'Button.1' },
    },
  ]);
});

test('one problem met by two steps is listed once, where it came first', async () => {
  const browser = fakeBrowser();
  const bundler = fakeBundler([bundleError('../x/index.js', 3, 'Unexpected "}"')]);
  const shop = workshop({ browser, bundler });
  const file = await verifyKit(shop.deps, 'tiny', shop.project);
  assert.deepEqual(file.steps, {
    schema: 'passed',
    imports: 'failed',
    types: 'passed',
    render: 'failed',
    tokens: 'skipped',
    look: 'skipped',
  });
  assert.deepEqual(file.issues, [
    {
      step: 'imports',
      path: 'runtime.entry',
      key: 'checkRule.tool',
      params: { text: 'Unexpected "}" (../x/index.js:3)' },
    },
  ]);
  // The catalog did not build, so there was no page to open.
  assert.deepEqual(browser.asked, []);
  assert.deepEqual([browser.opened, browser.closed], [1, 1]);
});

test('a browser that cannot start, or cannot inspect, skips render and tokens with the note', async () => {
  const missing: Browser = {
    async open() {
      throw new KitvasError('BROWSER_MISSING', { dir: 'x' });
    },
  };
  const first = workshop({ browser: missing });
  const none = await verifyKit(first.deps, 'tiny', first.project);
  assert.deepEqual([none.steps.render, none.steps.tokens], ['skipped', 'skipped']);
  assert.deepEqual(none.notes, ['kits.verify.noBrowser']);
  assert.equal(none.valid, true);

  let closed = 0;
  const blind: Browser = {
    async open() {
      return {
        name: 'fake',
        async visit() {
          throw new Error('never visited');
        },
        async close() {
          closed += 1;
        },
      };
    },
  };
  const second = workshop({ browser: blind });
  const old = await verifyKit(second.deps, 'tiny', second.project);
  assert.deepEqual([old.steps.render, old.steps.tokens], ['skipped', 'skipped']);
  assert.deepEqual(old.notes, ['kits.verify.noBrowser']);
  assert.equal(closed, 1);
});

test('any other failure of the browser is not swallowed', async () => {
  const broken: Browser = {
    async open() {
      throw new Error('the socket closed');
    },
  };
  const shop = workshop({ browser: broken });
  await assert.rejects(verifyKit(shop.deps, 'tiny', shop.project), /the socket closed/);
});
