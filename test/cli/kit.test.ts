import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CropResult, ScanResult, VerifyFile, VerifyIssue } from '../../src/checks/index.ts';
import { createKitCommand, type KitDeps, type KitView, runCli } from '../../src/cli/index.ts';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { generatedEntry, parseKit } from '../../src/kit/index.ts';
import { KitvasError, loadSettings, PLUGIN_ROOT, projectKitsDir } from '../../src/shared/index.ts';
import { copyKit, FIXTURE_KITS, tinyKitJson } from '../helpers/kits.ts';
import { fixtureProject, removeFixture } from '../helpers/projects.ts';
import { renderTools } from '../helpers/render.ts';
import { tempDir } from '../helpers/tmp.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  type FakePackage,
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
  writeText,
} from '../kit/helpers/project-kit.ts';

type Options = {
  /** The built-in layer; the fixture kits `broken` and `tiny` by default. */
  root?: string;
  /** The project folder; a new temp folder without a workspace by default. */
  cwd?: string;
  verify?: KitDeps['verify'];
  scan?: KitDeps['scan'];
  crop?: KitDeps['crop'];
};

type View<V extends KitView['view']> = Extract<KitView, { view: V }>;

function harness(options: Options = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const cwd = options.cwd ?? tempDir();
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd,
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  const command = createKitCommand({
    kits: layeredStore(cwd, options.root ?? FIXTURE_KITS),
    kitWriter: createFolderKitWriter(projectKitsDir(cwd)),
    projectFiles: createProjectFiles,
    render: renderTools,
    verify: options.verify ?? (() => Promise.reject(new Error('verify is not used here'))),
    scan: options.scan ?? (() => Promise.reject(new Error('scan is not used here'))),
    crop: options.crop ?? (() => Promise.reject(new Error('crop is not used here'))),
    previews: () => Promise.reject(new Error('previews is not used here')),
  });
  const run = (...argv: string[]) => runCli(['kit', ...argv], [command], io);
  const last = (lines: string[]): unknown => JSON.parse(lines.at(-1) ?? '');
  /** The data of the last JSON answer, which must be of this view. */
  const data = <V extends KitView['view']>(view: V): View<V> => {
    const value = (last(out) as { data: View<V> }).data;
    assert.equal(value.view, view);
    return value;
  };
  const error = () => (last(err) as { error: { code: string; message: string } }).error;
  return { out, err, io, run, data, error };
}

const REACT: Record<string, FakePackage> = {
  react: { version: '19.3.1' },
  'react-dom': { version: '19.3.1' },
};

const ACME_FILES = {
  'json/tokens.json': JSON.stringify(ACME_TOKENS),
  'json/css-var-map.json': JSON.stringify(ACME_MAP),
};

const useKitInConfig = (cwd: string, id: string): void =>
  writeText(join(cwd, '.kitvas', 'config.json'), JSON.stringify({ schemaVersion: 1, kit: id }));

test('list shows every kit and marks the ones that are not valid', async () => {
  const h = harness();
  assert.equal(await h.run('list', '--json'), 0);
  assert.deepEqual(
    h.data('list').kits.map((kit) => [kit.id, kit.valid]),
    [
      ['broken', false],
      ['tiny', true],
    ],
  );
  await h.run('list');
  assert.match(h.out.at(-1) ?? '', /tiny\s+Tiny 1\.0\.0/);
  assert.match(h.out.at(-1) ?? '', /broken\s+\(not valid\)/);
});

test('list with no kits says so', async () => {
  const h = harness({ root: join(tempDir(), 'none') });
  await h.run('list');
  assert.equal(h.out.at(-1), 'No kits found.');
});

test('list shows project kits next to the built-in ones', async () => {
  const cwd = tempProject();
  writeProjectKit(cwd, npmKitJson(), ACME_FILES);
  const h = harness({ cwd });
  await h.run('list', '--json');
  assert.deepEqual(
    h.data('list').kits.map((kit) => kit.id),
    ['acme', 'broken', 'tiny'],
  );
});

test('show reports a kit by id', async () => {
  const h = harness();
  assert.equal(await h.run('show', 'tiny', '--json'), 0);
  const { kit } = h.data('show');
  assert.equal(kit.components.length, 2);
  assert.equal(kit.tokens, 8);
  assert.equal(kit.icons, 2);
  assert.match(kit.hash, /^[0-9a-f]{64}$/);
  await h.run('show', 'tiny');
  assert.match(h.out.at(-1) ?? '', /^Tiny 1\.0\.0 \(tiny\)\n2 components, 8 tokens, 2 icons\n/);
  assert.match(h.out.at(-1) ?? '', /Button\s+action\s+Starts an action\./);
  assert.match(h.out.at(-1) ?? '', /Gaps \(no data from the source\): 1/);
});

test('without an id the project kit is used; an unknown kit is exit code 6', async () => {
  const h = harness();
  assert.equal(await h.run('show', '--json'), 6);
  assert.equal(h.error().code, 'KIT_NOT_FOUND');
  mkdirSync(join(h.io.cwd, '.kitvas'));
  writeFileSync(join(h.io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  assert.equal(await h.run('--json'), 0);
  assert.equal(h.data('show').kit.id, 'tiny');
});

test('check lists problems as text and still exits 0', async () => {
  const ok = harness();
  assert.equal(await ok.run('check', 'tiny'), 0);
  assert.equal(ok.out.at(-1), 'Kit "tiny" is valid.');

  const root = copyKit('tiny');
  rmSync(join(root, 'tiny', 'scss', 'index.scss'));
  const bad = harness({ root });
  assert.equal(await bad.run('check', 'tiny', '--json'), 0);
  assert.equal(bad.data('check').valid, false);
  assert.deepEqual(bad.data('check').issues, [
    { path: 'runtime.styles.files', message: 'File "scss/index.scss" is missing.' },
  ]);
  assert.deepEqual(bad.data('check').shadowed, []);
  await bad.run('check', 'tiny');
  assert.equal(
    bad.out.at(-1),
    'Kit "tiny" has 1 problem(s):\n  runtime.styles.files: File "scss/index.scss" is missing.',
  );
});

test('a kit.json that fails the schema is exit code 7', async () => {
  const h = harness();
  assert.equal(await h.run('check', 'broken', '--json'), 7);
  assert.equal(h.error().code, 'KIT_INVALID');
});

test('check adds the checks against the project on disk for a project kit', async () => {
  const cwd = tempProject({ 'src/theme/index.ts': 'export const theme = {};' }, REACT);
  writeProjectKit(cwd, npmKitJson(), ACME_FILES);
  const h = harness({ cwd });
  assert.equal(await h.run('check', 'acme', '--json'), 0);
  assert.deepEqual(h.data('check'), {
    view: 'check',
    id: 'acme',
    valid: false,
    issues: [
      { path: 'source.package', message: 'Package "@acme/ui" is not installed in the project.' },
      { path: 'runtime.styles.imports.1', message: 'File "src/theme/fonts.css" is missing.' },
    ],
    shadowed: [],
  });
});

test('check without an id also lists project folders hidden by a built-in kit', async () => {
  const cwd = tempProject();
  writeProjectKit(cwd, tinyKitJson());
  useKitInConfig(cwd, 'tiny');
  const h = harness({ cwd });
  const path = join(projectKitsDir(cwd), 'tiny');
  const taken = 'The id "tiny" belongs to a built-in kit; choose another.';
  assert.equal(await h.run('check', '--json'), 0);
  assert.deepEqual(h.data('check'), {
    view: 'check',
    id: 'tiny',
    valid: true,
    issues: [],
    shadowed: [{ id: 'tiny', path, issues: [{ path: 'id', message: taken }] }],
  });
  await h.run('check');
  assert.equal(
    h.out.at(-1),
    `Kit "tiny" is valid.\nKit "${path}" has 1 problem(s):\n  id: ${taken}`,
  );
  await h.run('check', 'tiny', '--json');
  assert.deepEqual(h.data('check').shadowed, []);
});

for (const name of ['acme-npm', 'acme-repo', 'acme-tailwind'] as const) {
  test(`the kit of the ${name} fixture project passes check with its disk checks`, async () => {
    const fixture = fixtureProject(name);
    try {
      const h = harness({ cwd: fixture.dir });
      assert.equal(await h.run('check', fixture.kitId, '--json'), 0);
      assert.deepEqual(h.data('check').issues, []);
      assert.equal(h.data('check').valid, true);
    } finally {
      removeFixture(fixture.dir);
    }
  });
}

test('component returns one catalog entry', async () => {
  const h = harness();
  assert.equal(await h.run('component', 'Button', 'tiny', '--json'), 0);
  assert.equal(h.data('component').component.name, 'Button');
  assert.equal(h.data('component').component.props.length, 3);
  await h.run('component', 'Button', 'tiny');
  assert.match(h.out.at(-1) ?? '', /^Button \(kit "tiny"\)\n\{/);
  assert.equal(await h.run('component', 'Nope', 'tiny', '--json'), 8);
  assert.equal(h.error().code, 'KIT_COMPONENT_NOT_FOUND');
  assert.equal(await h.run('component', '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
});

test('css prints the token sheet', async () => {
  const h = harness();
  assert.equal(await h.run('css', 'tiny'), 0);
  assert.match(h.out.at(-1) ?? '', /^:root \{\n {2}--kit-color-ink: #1d2025;/);
  await h.run('css', 'tiny', '--json');
  assert.equal(h.data('css').id, 'tiny');
});

test('css of a project kit points mapped tokens at the design system variables', async () => {
  const cwd = tempProject();
  writeProjectKit(cwd, npmKitJson(), ACME_FILES);
  const h = harness({ cwd });
  assert.equal(await h.run('css', 'acme'), 0);
  assert.equal(
    h.out.at(-1),
    ':root {\n  --kit-color-ink: var(--acme-color-ink);\n  --kit-space-sm: var(--acme-space-2);\n}\n',
  );
});

test('build renders the examples of a kit into the project and a second run is cached', async () => {
  const h = harness();
  mkdirSync(join(h.io.cwd, '.kitvas'));
  assert.equal(await h.run('build', 'tiny', '--json'), 0);
  const page = join(h.io.cwd, '.kitvas', 'cache', 'catalog', 'tiny', 'build', 'html', 'index.html');
  assert.deepEqual(h.data('build'), {
    view: 'build',
    id: 'tiny',
    built: true,
    cached: false,
    shown: ['Button.1'],
    skipped: [],
    errors: [],
    path: page,
  });
  assert.ok(existsSync(page));

  await h.run('build', 'tiny', '--json');
  assert.equal(h.data('build').cached, true);

  await h.run('build', 'tiny');
  assert.equal(h.out.at(-1), `The examples of kit "tiny" are up to date: 1 shown.\nOpen ${page}`);
});

test('build says what was built in words', async () => {
  const h = harness();
  mkdirSync(join(h.io.cwd, '.kitvas'));
  assert.equal(await h.run('build', 'tiny'), 0);
  assert.match(
    h.out.at(-1) ?? '',
    /^Built the examples of kit "tiny": 1 shown, 0 without a preview\.\nOpen .+index\.html$/,
  );
});

test('build without an id uses the project kit', async () => {
  const h = harness();
  mkdirSync(join(h.io.cwd, '.kitvas'));
  writeFileSync(join(h.io.cwd, '.kitvas', 'config.json'), '{"schemaVersion":1,"kit":"tiny"}');
  assert.equal(await h.run('build', '--json'), 0);
  assert.equal(h.data('build').id, 'tiny');
});

test('build needs the project workspace, an unknown kit is exit code 6 and a broken one 7', async () => {
  const h = harness();
  assert.equal(await h.run('build', 'tiny', '--json'), 13);
  assert.equal(h.error().code, 'WORKSPACE_MISSING');
  mkdirSync(join(h.io.cwd, '.kitvas'));
  assert.equal(await h.run('build', 'nope', '--json'), 6);
  assert.equal(h.error().code, 'KIT_NOT_FOUND');
  assert.equal(await h.run('build', 'broken', '--json'), 7);
  assert.equal(h.error().code, 'KIT_INVALID');
});

test('new creates a project kit from an installed package', async () => {
  const cwd = tempProject({}, { '@acme/ui': { version: '1.2.0' }, ...REACT });
  const h = harness({ cwd });
  assert.equal(await h.run('new', 'acme', '--from', 'npm:@acme/ui', '--json'), 0);
  const path = join(projectKitsDir(cwd), 'acme');
  assert.deepEqual(h.data('new'), {
    view: 'new',
    id: 'acme',
    path,
    source: { type: 'npm', package: '@acme/ui', version: '1.2.0' },
    skipped: [],
  });
  assert.ok(existsSync(join(path, 'kit.json')));
  assert.ok(existsSync(join(path, 'generated', 'kit.ts')));
  await h.run('list', '--json');
  assert.deepEqual(
    h.data('list').kits.map((kit) => [kit.id, kit.valid]),
    [
      ['acme', false],
      ['broken', false],
      ['tiny', true],
    ],
  );
  // The skeleton has no components: check refuses it until the learner fills kit.json.
  assert.equal(await h.run('check', 'acme', '--json'), 7);
  assert.equal(h.error().code, 'KIT_INVALID');
});

test('new from a folder says where the kit is', async () => {
  const cwd = tempProject({ 'src/ds/Button.tsx': 'export {};' }, REACT);
  const h = harness({ cwd });
  assert.equal(await h.run('new', 'firma', '--from', 'repo:./src/ds/'), 0);
  const path = join(projectKitsDir(cwd), 'firma');
  assert.equal(
    h.out.at(-1),
    `Created kit "firma" from src/ds in ${path}.\nNext: fill kit.json, then run "kitvas kit verify firma".`,
  );
});

test('new needs an id, a source and the workspace', async () => {
  const h = harness({ cwd: tempProject({}, {}, false) });
  assert.equal(await h.run('new', '--json'), 2);
  assert.match(h.error().message, /kit new needs a kit id/);
  assert.equal(await h.run('new', 'acme', '--json'), 2);
  assert.match(
    h.error().message,
    /kit new needs --from npm:<package>, repo:<folder>, figma:<file URL>, web:<page URL> or images:<folder>/,
  );
  assert.equal(await h.run('new', 'acme', '--from', 'git:acme', '--json'), 2);
  assert.equal(h.error().code, 'USAGE');
  assert.equal(await h.run('new', 'acme', '--from', 'npm:@acme/ui', '--json'), 13);
  assert.equal(h.error().code, 'WORKSPACE_MISSING');
});

test('new refuses a taken id, a missing package and a folder that is not usable', async () => {
  const cwd = tempProject({}, REACT);
  const h = harness({ cwd });
  assert.equal(await h.run('new', 'tiny', '--from', 'npm:react', '--json'), 35);
  assert.deepEqual(h.error(), {
    code: 'KIT_EXISTS',
    message: 'Kit "tiny" already exists (built-in).',
  });
  assert.equal(await h.run('new', 'acme', '--from', 'npm:@acme/ui', '--json'), 34);
  assert.deepEqual(h.error(), {
    code: 'KIT_PACKAGE_MISSING',
    message:
      '"@acme/ui" is not installed in this project. Install it here (for example "npm install @acme/ui"); kitvas does not install packages.',
  });
  assert.equal(await h.run('new', 'firma', '--from', 'repo:src/nope', '--json'), 36);
  assert.deepEqual(h.error(), {
    code: 'KIT_SOURCE_INVALID',
    message: 'The kit source is not usable: "src/nope" does not exist',
  });
});

test('use sets the project kit and writes the generated entry of a project kit', async () => {
  const cwd = tempProject();
  writeProjectKit(cwd, npmKitJson(), ACME_FILES);
  const h = harness({ cwd });
  assert.equal(await h.run('use', 'acme', '--json'), 0);
  assert.deepEqual(h.data('use'), { view: 'use', id: 'acme' });
  assert.equal(loadSettings({ home: h.io.home, cwd }).kit, 'acme');
  assert.equal(
    readFileSync(join(projectKitsDir(cwd), 'acme', 'generated', 'kit.ts'), 'utf8'),
    generatedEntry(parseKit(npmKitJson(), 'acme')).text,
  );
  assert.equal(await h.run('use', 'tiny'), 0);
  assert.equal(h.out.at(-1), 'This project now uses kit "tiny".');
  assert.equal(loadSettings({ home: h.io.home, cwd }).kit, 'tiny');
});

test('use needs an id, a kit that loads and the workspace', async () => {
  const h = harness({ cwd: tempProject() });
  assert.equal(await h.run('use', '--json'), 2);
  assert.match(h.error().message, /kit use needs a kit id/);
  assert.equal(await h.run('use', 'nope', '--json'), 6);
  assert.equal(await h.run('use', 'broken', '--json'), 7);
  assert.equal(loadSettings({ home: h.io.home, cwd: h.io.cwd }).kit, 'base');
  const bare = harness();
  assert.equal(await bare.run('use', 'tiny', '--json'), 13);
});

const EXPORT_MISSING: VerifyIssue = {
  step: 'imports',
  path: 'components.Button',
  key: 'kitIssue.exportMissing',
  params: { name: 'Button', from: '@acme/ui' },
};

const PASSED: VerifyFile = {
  schemaVersion: 1,
  kit: 'acme',
  hash: 'hash',
  at: '2026-11-23T10:00:00.000Z',
  valid: true,
  steps: {
    schema: 'passed',
    imports: 'passed',
    types: 'passed',
    render: 'skipped',
    tokens: 'skipped',
  },
  issues: [],
  notes: ['kits.verify.noBrowser'],
};

const FAILED: VerifyFile = {
  ...PASSED,
  kit: 'firma',
  valid: false,
  steps: {
    schema: 'passed',
    imports: 'failed',
    types: 'passed',
    render: 'passed',
    tokens: 'passed',
  },
  issues: [EXPORT_MISSING],
  notes: [],
};

test('verify answers what the verify use case found, with a sentence per issue', async () => {
  const cwd = tempProject();
  const calls: string[][] = [];
  const h = harness({
    cwd,
    verify: (project, id) => {
      calls.push([project, id]);
      return Promise.resolve(id === 'acme' ? PASSED : FAILED);
    },
  });
  assert.equal(await h.run('verify', 'acme', '--json'), 0);
  assert.deepEqual(h.data('verify'), { view: 'verify', ...PASSED });
  assert.deepEqual(calls, [[cwd, 'acme']]);
  await h.run('verify', 'acme');
  assert.equal(
    h.out.at(-1),
    [
      'Kit "acme" passed: schema, imports, types.',
      'Not run: render, tokens.',
      'render, tokens and look need Chrome, Edge or Chromium; none was found. Run "kitvas browser install".',
    ].join('\n'),
  );

  const exportMissing = '"Button" is not exported by "@acme/ui".';
  assert.equal(await h.run('verify', 'firma', '--json'), 0);
  assert.equal(h.data('verify').valid, false);
  assert.deepEqual(h.data('verify').issues, [{ ...EXPORT_MISSING, message: exportMissing }]);
  await h.run('verify', 'firma');
  assert.equal(
    h.out.at(-1),
    `Kit "firma" has 1 problem(s):\n  imports  components.Button: ${exportMissing}`,
  );

  await h.run('verify', '--json');
  assert.deepEqual(calls.at(-1), [cwd, 'base']);
});

test('verify needs the workspace', async () => {
  let called = false;
  const h = harness({
    verify: () => {
      called = true;
      return Promise.resolve(PASSED);
    },
  });
  assert.equal(await h.run('verify', 'acme', '--json'), 13);
  assert.equal(h.error().code, 'WORKSPACE_MISSING');
  assert.equal(called, false);
});

test('an unknown sub-command is a usage error', async () => {
  const h = harness();
  assert.equal(await h.run('nope'), 2);
  assert.match(h.err.at(-1) ?? '', /unknown kit command "nope"/);
});

const SCANNED: ScanResult = {
  id: 'site',
  pages: [
    { url: 'https://example.com/', width: 1280, folder: 'source/web/1-1280', candidates: 7 },
    { url: 'https://example.com/', width: 390, folder: 'source/web/1-390', candidates: 0 },
  ],
};

test('scan passes the --url flags and --allow-private to the scan use case', async () => {
  const cwd = tempProject();
  const calls: [string, string, { urls: string[]; allowPrivate: boolean }][] = [];
  const h = harness({
    cwd,
    scan: (project, id, options) => {
      calls.push([project, id, options]);
      return Promise.resolve(SCANNED);
    },
  });
  const args = ['scan', 'site', '--url', 'https://a.test/', '--url', 'https://b.test/x'];
  assert.equal(await h.run(...args, '--allow-private', '--json'), 0);
  assert.deepEqual(h.data('scan'), { view: 'scan', ...SCANNED });
  assert.equal(await h.run('scan', 'site'), 0);
  assert.deepEqual(calls, [
    [cwd, 'site', { urls: ['https://a.test/', 'https://b.test/x'], allowPrivate: true }],
    [cwd, 'site', { urls: [], allowPrivate: false }],
  ]);
  assert.equal(
    h.out.at(-1),
    [
      'Scanned 2 page(s) for kit "site".',
      '  https://example.com/ at 1280 px: 7 candidate(s) in source/web/1-1280',
      '  https://example.com/ at 390 px: 0 candidate(s) in source/web/1-390',
    ].join('\n'),
  );
});

test('scan needs a kit id and the workspace', async () => {
  let called = false;
  const scan: KitDeps['scan'] = () => {
    called = true;
    return Promise.resolve(SCANNED);
  };
  const h = harness({ cwd: tempProject(), scan });
  assert.equal(await h.run('scan', '--json'), 2);
  assert.match(h.error().message, /kit scan needs a kit id/);
  const bare = harness({ scan });
  assert.equal(await bare.run('scan', 'site', '--json'), 13);
  assert.equal(bare.error().code, 'WORKSPACE_MISSING');
  assert.equal(called, false);
});

test('a refused address is SCAN_BLOCKED with exit code 37, a page that fails is 38', async () => {
  const blocked = harness({
    cwd: tempProject(),
    scan: () => Promise.reject(new KitvasError('SCAN_BLOCKED', { url: 'http://127.0.0.1/' })),
  });
  assert.equal(await blocked.run('scan', 'site', '--json'), 37);
  assert.deepEqual(blocked.error(), {
    code: 'SCAN_BLOCKED',
    message: 'http://127.0.0.1/ is a private or local address; pass --allow-private to scan it.',
  });
  const failed = harness({
    cwd: tempProject(),
    scan: () =>
      Promise.reject(new KitvasError('SCAN_FAILED', { url: 'https://a.test/', detail: 'timeout' })),
  });
  assert.equal(await failed.run('scan', 'site', '--json'), 38);
  assert.equal(failed.error().code, 'SCAN_FAILED');
});

test('crop lists the written files and the error lines, and exits 0 with them', async () => {
  const cwd = tempProject();
  const result: CropResult = {
    id: 'site',
    written: ['source/refs/button.png', 'source/refs/card.png'],
    errors: [{ name: 'hero', message: 'The box is outside the image.' }],
  };
  const calls: string[][] = [];
  const h = harness({
    cwd,
    crop: (project, id) => {
      calls.push([project, id]);
      return Promise.resolve(result);
    },
  });
  assert.equal(await h.run('crop', 'site', '--json'), 0);
  assert.deepEqual(h.data('crop'), { view: 'crop', ...result });
  assert.equal(await h.run('crop', 'site'), 0);
  assert.equal(
    h.out.at(-1),
    'Wrote 2 reference image(s) for kit "site".\n  hero: The box is outside the image.',
  );
  assert.deepEqual(calls, [
    [cwd, 'site'],
    [cwd, 'site'],
  ]);
  assert.equal(await h.run('crop', '--json'), 2);
  assert.match(h.error().message, /kit crop needs a kit id/);
});

test('new names a figma file and the hosts of a website in its answer', async () => {
  const cwd = tempProject({}, REACT);
  const h = harness({ cwd });
  const figma = 'https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/Acme';
  assert.equal(await h.run('new', 'design', '--from', `figma:${figma}`), 0);
  assert.match(h.out.at(-1) ?? '', new RegExp(`^Created kit "design" from ${figma} in `));
  assert.equal(await h.run('new', 'site', '--from', 'web:https://example.com/a', '--json'), 0);
  assert.deepEqual(h.data('new').source, { type: 'web', urls: ['https://example.com/a'] });
  await h.run('new', 'site2', '--from', 'web:https://example.com/b');
  assert.match(h.out.at(-1) ?? '', /^Created kit "site2" from example\.com in /);
});

test('verify prints advice under a valid kit and lists look among the steps', async () => {
  const advised: VerifyFile = {
    ...PASSED,
    schemaVersion: 2,
    kit: 'site',
    steps: { ...PASSED.steps, render: 'passed', tokens: 'passed', look: 'passed' },
    issues: [
      {
        step: 'look',
        path: 'components.Button',
        key: 'kitIssue.lookNoReference',
        params: { component: 'Button' },
      },
    ],
    look: [{ key: 'Button.1', score: 96, size: 100, colour: 97, structure: 96 }],
    notes: [],
  };
  const h = harness({ cwd: tempProject(), verify: () => Promise.resolve(advised) });
  await h.run('verify', 'site');
  assert.equal(
    h.out.at(-1),
    [
      'Kit "site" passed: schema, imports, types, render, tokens, look.',
      'Advice:',
      '  look  components.Button: Button has no example with a reference image, so its look is not checked.',
    ].join('\n'),
  );
  await h.run('verify', 'site', '--json');
  assert.deepEqual(h.data('verify').look, advised.look);
});
