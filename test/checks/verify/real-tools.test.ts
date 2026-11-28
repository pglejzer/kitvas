// `kit verify` with the real esbuild, Sass, tsc and browser. Like test/checks/browser.test.ts, these
// need Chrome, Edge or an installed Chromium on the machine.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPlaywrightBrowser } from '../../../src/checks/adapters/browser/playwright-browser.ts';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import { type VerifyDeps, type VerifyFile, verifyKit } from '../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from '../../../src/kit/adapters/layered-store.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import type { KitStore } from '../../../src/kit/index.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { projectStylesOf, renderTools } from '../../helpers/draft/render.ts';
import { builtinKits, FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { fixtureProject, removeFixture } from '../../helpers/kit/projects.ts';
import { tempDir } from '../../helpers/tmp.ts';

const browser = createPlaywrightBrowser({
  roots: [PLUGIN_ROOT],
  browsersDir: join(tempDir(), 'browsers'),
});

const ALL_PASSED = {
  schema: 'passed',
  imports: 'passed',
  types: 'passed',
  render: 'passed',
  tokens: 'passed',
  // None of these kits is a written kit.
  look: 'skipped',
  original: 'skipped',
};

/** Verifies one kit of `kits` for `project` with the real tools, and stops them afterwards. */
async function verify(kits: KitStore, kitId: string, project: string): Promise<VerifyFile> {
  const tools = renderTools();
  const deps: VerifyDeps = {
    kits,
    kitWriter: createFolderKitWriter(projectKitsDir(project)),
    projectFiles: (dir) => createProjectFiles(dir),
    projectStyles: projectStylesOf(tools),
    render: tools,
    types: createTscChecker({ roots: [PLUGIN_ROOT] }),
    browser,
    now: () => new Date('2026-11-23T10:00:00.000Z'),
  };
  try {
    return await verifyKit(deps, kitId, project);
  } finally {
    await tools.bundler.dispose();
    await tools.styles.dispose();
    await tools.utility.dispose();
  }
}

const projectKits = (project: string): KitStore =>
  createLayeredKitStore(builtinKits(), {
    dir: project,
    store: createFolderKitStore(projectKitsDir(project)),
  });

test('the tiny fixture kit is valid: it bundles, compiles and shows its example', async () => {
  const file = await verify(createFolderKitStore(FIXTURE_KITS), 'tiny', tempDir('kitvas-verify-'));
  assert.deepEqual(file.issues, []);
  // The tiny kit maps no token onto a variable, so there is nothing to compare.
  assert.deepEqual(file.steps, { ...ALL_PASSED, tokens: 'skipped' });
  assert.equal(file.valid, true);
  assert.deepEqual(file.notes, ['kits.verify.noTokenMap', 'kits.verify.notWritten']);
});

test('the kitvas UI kit is valid', async () => {
  const file = await verify(builtinKits(), 'kitvas-ui', tempDir('kitvas-verify-'));
  assert.deepEqual(file.issues, []);
  assert.deepEqual(file.steps, { ...ALL_PASSED, tokens: 'skipped' });
  assert.equal(file.valid, true);
  assert.deepEqual(file.notes, ['kits.verify.noTokenMap', 'kits.verify.notWritten']);
});

test('the npm fixture kit is valid in all five steps, its tokens read from the package styles', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    const file = await verify(projectKits(dir), kitId, dir);
    assert.deepEqual(file.issues, []);
    assert.deepEqual(file.steps, ALL_PASSED);
    assert.equal(file.valid, true);
  } finally {
    removeFixture(dir);
  }
});

/** Verifies the npm fixture kit with its `8px` space variable written as `value`. */
async function verifySpace(value: string): Promise<VerifyFile> {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    const styles = join(dir, 'node_modules', '@acme', 'ui', 'styles.css');
    writeFileSync(
      styles,
      readFileSync(styles, 'utf8').replace(
        '--acme-space-2: 8px;',
        `--acme-base: 0.5rem;\n  --acme-space-2: ${value};`,
      ),
    );
    return await verify(projectKits(dir), kitId, dir);
  } finally {
    removeFixture(dir);
  }
}

test('a variable the browser works out with calc() is held against its token in px', async () => {
  // The way shadcn writes its radii: `calc(var(--radius) - 2px)`.
  const same = await verifySpace('calc(var(--acme-base) - 0px)');
  assert.deepEqual(same.issues, []);
  assert.equal(same.steps.tokens, 'passed');

  const other = await verifySpace('calc(var(--acme-base) - 2px)');
  assert.deepEqual(
    other.issues.map((issue) => [
      issue.step,
      issue.key,
      issue.params.expected,
      issue.params.actual,
    ]),
    [['tokens', 'kitIssue.tokenMismatch', '8px', '6px']],
  );
});

test('wrong claims in kit.json come back at their places', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    const kitJson = join(projectKitsDir(dir), kitId, 'kit.json');
    const kit = JSON.parse(readFileSync(kitJson, 'utf8')) as {
      components: Record<string, unknown>[];
    };
    const button = kit.components[0] as { props: { values?: string[] }[] };
    button.props[0]?.values?.push('loud');
    kit.components.push({
      name: 'Missing',
      category: 'display',
      description: 'A component the package does not have.',
      import: { from: '@acme/ui', name: 'Missing' },
      props: [],
    });
    writeFileSync(kitJson, JSON.stringify(kit, null, 2));
    const tokens = join(projectKitsDir(dir), kitId, 'json', 'tokens.json');
    writeFileSync(
      tokens,
      readFileSync(tokens, 'utf8').replace('[0.102, 0.102, 0.102]', '[1, 0, 0]'),
    );

    const file = await verify(projectKits(dir), kitId, dir);
    assert.equal(file.valid, false);
    assert.deepEqual(
      file.issues.map((issue) => [issue.step, issue.path, issue.key]),
      [
        ['imports', 'components.3.import', 'kitIssue.exportMissing'],
        ['types', 'components.0.props.0', 'kitIssue.propRejected'],
        ['tokens', 'tokens.color.ink', 'kitIssue.tokenMismatch'],
      ],
    );
    assert.deepEqual(file.issues[0]?.params, { name: 'Missing', from: '@acme/ui' });
    assert.deepEqual(
      [file.issues[1]?.params.component, file.issues[1]?.params.prop, file.issues[1]?.params.value],
      ['Button', 'variant', 'loud'],
    );
    assert.deepEqual(file.issues[2]?.params, {
      token: 'color.ink',
      expected: '#ff0000',
      actual: '#1a1a1a',
      variable: '--acme-color-ink',
    });
    assert.deepEqual(file.steps, {
      schema: 'passed',
      imports: 'failed',
      types: 'failed',
      render: 'passed',
      tokens: 'failed',
      look: 'skipped',
      original: 'skipped',
    });
  } finally {
    removeFixture(dir);
  }
});
