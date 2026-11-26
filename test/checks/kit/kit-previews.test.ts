import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  type Browser,
  makePreviews,
  PREVIEWS_STAMP,
  type PreviewShot,
  type PreviewsDeps,
  readPreviews,
  readPreviewsStamp,
  type ShotBatch,
  type ShotReport,
} from '../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { CATALOG_STAMP, readCatalogStamp } from '../../../src/render/index.ts';
import { catalogDir, KitvasError, projectKitsDir } from '../../../src/shared/index.ts';
import { closeRenderTools, renderTools } from '../../helpers/draft/render.ts';
import { copyKit, tinyKitJson } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';

type FakeShooter = { browser: Browser; batches: ShotBatch[]; opened: number; closed: number };

const written = (): ShotReport => ({
  state: 'written',
  width: 80,
  height: 40,
  backdrop: '#fafafa',
});

/** A browser whose session writes a few bytes for each shot `answer` calls written. */
function fakeShooter(
  answer: (shot: PreviewShot) => ShotReport = written,
  canShoot = true,
): FakeShooter {
  const fake: FakeShooter = {
    batches: [],
    opened: 0,
    closed: 0,
    browser: {
      async open() {
        fake.opened += 1;
        const shoot = async (batch: ShotBatch): Promise<ShotReport[]> => {
          fake.batches.push(batch);
          return batch.shots.map((shot) => {
            const report = answer(shot);
            if (report.state === 'written') {
              mkdirSync(dirname(shot.out), { recursive: true });
              writeFileSync(shot.out, 'png');
            }
            return report;
          });
        };
        return {
          name: 'fake',
          async visit() {
            throw new Error('previews never visit a draft');
          },
          ...(canShoot ? { shoot } : {}),
          async close() {
            fake.closed += 1;
          },
        };
      },
    },
  };
  return fake;
}

/** The tiny kit in a folder of its own, a project, and the real build tools; `null`: no browser. */
function setup(shooter: FakeShooter | null = fakeShooter()) {
  const root = copyKit('tiny');
  const project = tempDir('kitvas-previews-');
  const tools = renderTools();
  const kits = createFolderKitStore(root);
  const deps: PreviewsDeps = {
    kits,
    kitWriter: createFolderKitWriter(projectKitsDir(project)),
    render: tools,
    browser: shooter?.browser,
  };
  const dir = catalogDir(project, 'tiny');
  const stamp = () => readPreviewsStamp(readFileSync(join(dir, PREVIEWS_STAMP), 'utf8'));
  const disk = () => readPreviews({ kits, ...tools }, 'tiny', project);
  const writeKitJson = (json: Record<string, unknown>): void =>
    writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json, null, 2));
  return { root, project, tools, deps, dir, stamp, disk, writeKitJson };
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test("each component's first shown example and the icon sheet are shot, the stamp last", async () => {
  const shooter = fakeShooter();
  const kit = setup(shooter);
  try {
    const result = await makePreviews(kit.deps, 'tiny', kit.project);
    assert.equal(result.cached, false);
    assert.deepEqual(result.components, ['Button']);
    assert.deepEqual(result.failed, []);
    assert.equal(result.icons, 2);

    const [examples, sheet] = shooter.batches;
    assert.equal(shooter.batches.length, 2);
    assert.deepEqual([examples?.width, examples?.height, examples?.scale], [240, 480, 2]);
    assert.equal(examples?.page, join(kit.dir, 'build', 'html', 'index.html'));
    assert.deepEqual(
      examples?.shots.map((shot) => [shot.search, shot.target, shot.reach]),
      [['?example=Button.1', '#root > *', true]],
    );
    // The sheet is its grid exactly: no shadow reach, so its cells stay where the math puts them.
    assert.deepEqual(
      sheet?.shots.map((shot) => [shot.search, shot.target, shot.reach]),
      [['?example=kitvas-icons', '[data-kitvas-sheet]', false]],
    );
    assert.equal(sheet?.scale, 2);

    const catalog = readCatalogStamp(readFileSync(join(kit.dir, CATALOG_STAMP), 'utf8'));
    assert.deepEqual(catalog?.icons, ['check', 'close']);
    const js = readFileSync(join(kit.dir, 'build', 'js', 'index.js'), 'utf8');
    assert.ok(js.includes('kitvas-icons'), 'the catalog bundle holds the sheet');
    const stamp = kit.stamp();
    assert.equal(stamp?.catalog, catalog?.key);
    assert.equal(stamp?.backdrop, '#fafafa');
    assert.deepEqual(stamp?.components, { Button: 'component-0.png' });
    assert.deepEqual(stamp?.icons, {
      file: 'icons.png',
      cell: 32,
      columns: 2,
      names: ['check', 'close'],
    });
    assert.ok(existsSync(join(result.path, 'component-0.png')));
    assert.ok(existsSync(join(result.path, 'icons.png')));
    assert.equal(shooter.closed, 1);
    assert.equal(kit.disk().fresh, true);
  } finally {
    await closeRenderTools(kit.tools);
  }
});

test('an unchanged kit costs nothing: the second run opens no browser', async () => {
  const shooter = fakeShooter();
  const kit = setup(shooter);
  try {
    await makePreviews(kit.deps, 'tiny', kit.project);
    const again = await makePreviews(kit.deps, 'tiny', kit.project);
    assert.equal(again.cached, true);
    assert.deepEqual(again.components, ['Button']);
    assert.equal(shooter.opened, 1);
    assert.equal(shooter.batches.length, 2);
  } finally {
    await closeRenderTools(kit.tools);
  }
});

test('a kit change makes them stale; the next set gets a new folder and the old one goes', async () => {
  const kit = setup();
  try {
    await makePreviews(kit.deps, 'tiny', kit.project);
    const before = kit.stamp();
    assert.ok(before);
    const json = tinyKitJson();
    json.icons = { source: 'component', component: 'Icon', names: ['check', 'close', 'plus'] };
    kit.writeKitJson(json);

    const stale = kit.disk();
    assert.equal(stale.fresh, false);
    assert.equal(stale.stamp?.folder, before.folder, 'the old set is still there to show');
    assert.notEqual(stale.key, before.catalog);

    const result = await makePreviews(kit.deps, 'tiny', kit.project);
    const after = kit.stamp();
    assert.equal(result.cached, false);
    assert.equal(result.icons, 3);
    assert.notEqual(after?.folder, before.folder);
    assert.equal(existsSync(join(kit.dir, 'previews', before.folder)), false);
    assert.equal(kit.disk().fresh, true);
  } finally {
    await closeRenderTools(kit.tools);
  }
});

test('without a browser, or one that cannot shoot, the answer is BROWSER_MISSING', async () => {
  const none = setup(null);
  try {
    await assert.rejects(makePreviews(none.deps, 'tiny', none.project), isCode('BROWSER_MISSING'));
    assert.equal(existsSync(join(none.dir, PREVIEWS_STAMP)), false);
  } finally {
    await closeRenderTools(none.tools);
  }
  const shooter = fakeShooter(written, false);
  const blind = setup(shooter);
  try {
    await assert.rejects(
      makePreviews(blind.deps, 'tiny', blind.project),
      isCode('BROWSER_MISSING'),
    );
    assert.equal(shooter.closed, 1, 'the session is closed again');
  } finally {
    await closeRenderTools(blind.tools);
  }
});

test('a shot that fails leaves its component out and says why; the sheet still counts', async () => {
  const shooter = fakeShooter((shot) =>
    shot.search === '?example=Button.1'
      ? { state: 'failed', error: 'the example failed to render' }
      : { state: 'written', width: 64, height: 32, backdrop: 'rgb(1, 2, 3)' },
  );
  const kit = setup(shooter);
  try {
    const result = await makePreviews(kit.deps, 'tiny', kit.project);
    assert.deepEqual(result.components, []);
    assert.deepEqual(result.failed, [
      { component: 'Button', error: 'the example failed to render' },
    ]);
    const stamp = kit.stamp();
    assert.deepEqual(stamp?.components, {});
    assert.equal(stamp?.icons?.file, 'icons.png');
    assert.equal(stamp?.backdrop, 'rgb(1, 2, 3)', "the sheet's when no component has one");
  } finally {
    await closeRenderTools(kit.tools);
  }
});

test('examples that do not build answer PREVIEWS_FAILED and shoot nothing', async () => {
  const shooter = fakeShooter();
  const kit = setup(shooter);
  try {
    writeFileSync(join(kit.root, 'tiny', 'scss', 'index.scss'), '.a { color: $missing; }\n');
    await assert.rejects(makePreviews(kit.deps, 'tiny', kit.project), isCode('PREVIEWS_FAILED'));
    assert.equal(shooter.opened, 0);
  } finally {
    await closeRenderTools(kit.tools);
  }
});

test('reading the previews of a kit that does not exist finds no key and nothing fresh', async () => {
  const kit = setup();
  try {
    const disk = readPreviews({ kits: kit.deps.kits, ...kit.tools }, 'nokit', kit.project);
    assert.deepEqual(disk, { key: undefined, stamp: undefined, fresh: false });
  } finally {
    await closeRenderTools(kit.tools);
  }
});
