// The step `original` with the real tools and a real browser, over the three fixture projects whose
// components are not React. Needs Chrome, Edge or Chromium; the tests skip when none starts.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { createPlaywrightBrowser } from '../../../src/checks/adapters/browser/playwright-browser.ts';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import { type VerifyDeps, type VerifyFile, verifyKit } from '../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from '../../../src/kit/adapters/layered-store.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { closeRenderTools, projectStylesOf, renderTools } from '../../helpers/draft/render.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';
import { type FixtureName, fixtureProject, removeFixture } from '../../helpers/kit/projects.ts';
import { tempDir } from '../../helpers/tmp.ts';

const browser = createPlaywrightBrowser({
  roots: [PLUGIN_ROOT],
  browsersDir: join(tempDir(), 'browsers'),
});

async function verify(project: string, kitId: string): Promise<VerifyFile> {
  const tools = renderTools();
  const deps: VerifyDeps = {
    kits: createLayeredKitStore(builtinKits(), {
      dir: project,
      store: createFolderKitStore(projectKitsDir(project)),
    }),
    kitWriter: createFolderKitWriter(projectKitsDir(project)),
    projectFiles: (dir) => createProjectFiles(dir),
    projectStyles: projectStylesOf(tools),
    render: tools,
    types: createTscChecker({ roots: [PLUGIN_ROOT] }),
    browser,
    now: () => new Date('2026-11-27T10:00:00.000Z'),
  };
  try {
    return await verifyKit(deps, kitId, project);
  } finally {
    await closeRenderTools(tools);
  }
}

/** Changes one file of a fixture project (a project path, or a kit path under `.kitvas/kits/`). */
function change(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${file} holds ${from}`);
  writeFileSync(file, text.replace(from, to));
}

/** Runs `body` on a fresh copy of a fixture; skips when the machine has no browser. */
async function onFixture(
  t: TestContext,
  name: FixtureName,
  prepare: (dir: string, kitDir: string) => void,
  body: (file: VerifyFile) => void,
): Promise<void> {
  const { dir, kitId } = fixtureProject(name);
  try {
    prepare(dir, join(projectKitsDir(dir), kitId));
    const file = await verify(dir, kitId);
    if (file.notes.includes('kits.verify.noBrowser')) {
      t.skip('no browser on this machine');
      return;
    }
    body(file);
  } finally {
    removeFixture(dir);
  }
}

const ofOriginal = (file: VerifyFile) => file.issues.filter((issue) => issue.step === 'original');

for (const name of ['acme-templates', 'acme-sfc', 'acme-partials'] as const) {
  test(`${name}: every copy matches the original drawn from the project's own styles`, async (t) => {
    await onFixture(
      t,
      name,
      () => {},
      (file) => {
        assert.deepEqual(ofOriginal(file), []);
        assert.equal(file.steps.original, 'passed');
        // No picture of the app was given: nothing was looked at, and the answer says what to give.
        assert.equal(file.steps.look, 'skipped');
        assert.ok(file.notes.includes('kits.verify.noPictures'));
        const originals = file.originals ?? [];
        // Three components, six examples, each at 1280 px at least.
        assert.ok(originals.length >= 6, `${originals.length} measures`);
        for (const entry of originals) {
          assert.equal(entry.differences, 0, `${entry.key} at ${entry.width}`);
          assert.equal(entry.score, 100, `${entry.key} at ${entry.width}`);
          assert.ok(entry.frames >= 1, entry.key);
        }
        assert.deepEqual(
          (file.compared ?? []).map((entry) => entry.level),
          ['code', 'code', 'code'],
        );
      },
    );
  });
}

test("acme-twcode: every copy matches the original drawn with the project's own Tailwind 3", async (t) => {
  await onFixture(
    t,
    'acme-twcode',
    () => {},
    (file) => {
      assert.deepEqual(ofOriginal(file), []);
      assert.equal(file.steps.original, 'passed');
      const originals = file.originals ?? [];
      // Two examples of one button, each at 1280 px at least.
      assert.ok(originals.length >= 2, `${originals.length} measures`);
      for (const entry of originals) {
        assert.equal(entry.differences, 0, `${entry.key} at ${entry.width}`);
        assert.equal(entry.score, 100, `${entry.key} at ${entry.width}`);
        assert.ok(entry.frames >= 1, entry.key);
      }
      assert.deepEqual(
        (file.compared ?? []).map((entry) => entry.level),
        ['code'],
      );
    },
  );
});

test('a control is read at rest, under the pointer, pressed and with focus', async (t) => {
  await onFixture(
    t,
    'acme-sfc',
    () => {},
    (file) => {
      const frames = new Map((file.originals ?? []).map((entry) => [entry.key, entry.frames]));
      assert.equal(frames.get('Button.1'), 4);
      // A disabled button takes no pointer and no focus.
      assert.equal(frames.get('Button.3'), 1);
    },
  );
});

test('one changed value in a copy is named with both values, and nothing else is', async (t) => {
  await onFixture(
    t,
    'acme-sfc',
    (_dir, kitDir) =>
      change(
        join(kitDir, 'components', 'Button.module.css'),
        'border-radius: var(--kit-radius-sm);',
        'border-radius: var(--kit-radius-md);',
      ),
    (file) => {
      assert.equal(file.steps.original, 'failed');
      const differs = ofOriginal(file).filter((issue) => issue.key === 'kitIssue.originalDiffers');
      assert.ok(differs.length > 0);
      for (const issue of differs) {
        assert.equal(issue.params?.property, 'border-radius', JSON.stringify(issue.params));
        assert.equal(issue.params?.copy, '8px 8px 8px 8px');
        assert.equal(issue.params?.original, '6px 6px 6px 6px');
      }
      // Every other finding is the picture of the same example, never another kind.
      const kinds = new Set(ofOriginal(file).map((issue) => issue.key));
      kinds.delete('kitIssue.originalDiffers');
      kinds.delete('kitIssue.originalFar');
      assert.deepEqual([...kinds], []);
      // The step is advice: it fails, and a draft may still use the kit.
      const button = (file.originals ?? []).find((entry) => entry.key === 'Button.1');
      assert.ok(button && button.differences > 0);
      const field = (file.originals ?? []).find((entry) => entry.key === 'Field.1');
      assert.equal(field?.differences, 0);
    },
  );
});

test("a style only the project's build could read leaves its component read, never compared", async (t) => {
  await onFixture(
    t,
    'acme-sfc',
    (dir) =>
      change(
        join(dir, 'src', 'components', 'Card.vue'),
        '</style>',
        '.card :deep(.badge) {\n  color: #b00020;\n}\n</style>',
      ),
    (file) => {
      const partial = ofOriginal(file).filter((issue) => issue.key === 'kitIssue.originalPartial');
      assert.equal(partial.length, 1);
      assert.equal(partial[0]?.params?.component, 'Card');
      assert.match(String(partial[0]?.params?.detail), /:deep\(\.badge\)/);
      // Advice only: the step passes, and no number is given for Card.
      assert.equal(file.steps.original, 'passed');
      assert.deepEqual(
        (file.originals ?? []).filter((entry) => entry.key.startsWith('Card.')),
        [],
      );
      const levels = new Map((file.compared ?? []).map((entry) => [entry.component, entry]));
      assert.deepEqual(levels.get('Card'), { component: 'Card', level: 'read', why: 'partial' });
      assert.equal(levels.get('Button')?.level, 'code');
    },
  );
});
