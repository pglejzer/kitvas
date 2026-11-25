// Use case: `kitvas kit previews`, the previews of a kit for the editor's Insert pane (ADR 0075). The
// catalog is built (or found current), each component's first shown example and the icon sheet are
// shot once, and a stamp keyed by the catalog's key says for which build they were made. The studio
// reads them with `readPreviews` on a palette request; that builds and shoots nothing.

import { join } from 'node:path';
import { serializeJson } from '../../drafts/index.ts';
import { type KitComponent, type KitStore, type KitWriter, requireKit } from '../../kit/index.ts';
import {
  type BuildFs,
  type Bundler,
  buildCatalog,
  CATALOG_PAGE,
  CATALOG_STAMP,
  type CatalogKeyDeps,
  currentCatalogKey,
  exampleKey,
  ICON_SHEET_KEY,
  ICON_SHEET_MARK,
  readCatalogStamp,
  SHEET_CELL,
  type StylePipeline,
  sheetColumns,
  type UtilityCss,
} from '../../render/index.ts';
import { catalogDir, KitvasError } from '../../shared/index.ts';
import {
  BACKDROP,
  componentFile,
  PREVIEWS_DIR,
  PREVIEWS_FORMAT,
  PREVIEWS_STAMP,
  type PreviewsStamp,
  previewFolder,
  previewsFresh,
  readPreviewsStamp,
  SHEET_FILE,
  SHOT_SCALE,
  SHOT_VIEWPORT,
  stampFiles,
} from '../domain/kit/previews.ts';
import type {
  Browser,
  BrowserSession,
  PreviewShot,
  ShotBatch,
  ShotReport,
} from '../ports/browser.ts';

export type PreviewsDeps = {
  kits: KitStore;
  kitWriter: KitWriter;
  /** The same tools `kitvas kit build` gets, passed on to the catalog build. */
  render: {
    bundler: Bundler;
    styles: StylePipeline;
    fs: BuildFs;
    runtimeFiles: string[];
    utility: UtilityCss;
  };
  /** Without one, or when it cannot start, the answer is `BROWSER_MISSING`. */
  browser?: Browser | undefined;
};

export type PreviewsResult = {
  id: string;
  /** True when the previews on disk were made for the kit as it is: nothing was shot. */
  cached: boolean;
  /** Components with a preview, in kit order. */
  components: string[];
  /** Components whose example could not be shot, with the reason. */
  failed: { component: string; error: string }[];
  /** Icons on the sheet; 0 when there is none. */
  icons: number;
  /** Absolute folder of the previews' files. */
  path: string;
};

/** What the studio finds on disk for one kit, read on each palette request. */
export type PreviewsOnDisk = {
  /** The key a catalog build of the kit would have now; `undefined` when the kit cannot be built. */
  key: string | undefined;
  /** The previews on disk whose files are all there, whatever build they were made for. */
  stamp: PreviewsStamp | undefined;
  /** True when `stamp` was made for the kit as it is now. */
  fresh: boolean;
};

/** The element a component's shot takes: the first one the example renders. */
const EXAMPLE_ROOT = '#root > *';
/** Room around the sheet in its page: the catalog body's padding on both sides, and some. */
const SHEET_ROOM = 64;

const filesThere = (fs: BuildFs, dir: string, stamp: PreviewsStamp): boolean =>
  stampFiles(stamp).every((file) => fs.exists(join(dir, PREVIEWS_DIR, stamp.folder, file)));

/** The stamp of the previews of `kitId` and whether it is current; reads files, writes nothing. */
export function readPreviews(deps: CatalogKeyDeps, kitId: string, project: string): PreviewsOnDisk {
  const dir = catalogDir(project, kitId);
  const read = readPreviewsStamp(deps.fs.readText(join(dir, PREVIEWS_STAMP)));
  const stamp =
    read !== undefined && read.kit === kitId && filesThere(deps.fs, dir, read) ? read : undefined;
  let key: string | undefined;
  try {
    key = currentCatalogKey(deps, kitId, dir);
  } catch (error) {
    // A kit that is gone or cannot be built has no previews to make.
    if (!(error instanceof KitvasError)) throw error;
  }
  return { key, stamp, fresh: previewsFresh(stamp, kitId, key) };
}

const resultOf = (
  stamp: PreviewsStamp,
  dir: string,
  cached: boolean,
  failed: PreviewsResult['failed'],
): PreviewsResult => ({
  id: stamp.kit,
  cached,
  components: Object.keys(stamp.components),
  failed,
  icons: stamp.icons?.names.length ?? 0,
  path: join(dir, PREVIEWS_DIR, stamp.folder),
});

type Shooter = {
  shoot(batch: ShotBatch): Promise<ShotReport[]>;
  close(): Promise<void>;
};

/** A session that can shoot, or `BROWSER_MISSING`. */
async function openShooter(browser: Browser | undefined): Promise<Shooter> {
  if (!browser) throw new KitvasError('BROWSER_MISSING');
  const session: BrowserSession = await browser.open();
  const { shoot } = session;
  if (!shoot) {
    await session.close();
    throw new KitvasError('BROWSER_MISSING');
  }
  return { shoot: (batch) => shoot.call(session, batch), close: () => session.close() };
}

/** Removes every set of `previewsDir` but `keep`; the stamp beside them stays. */
function removeOtherSets(fs: BuildFs, previewsDir: string, keep: string): void {
  const sets = new Set(
    fs
      .listFiles(previewsDir)
      .filter((file) => file.includes('/'))
      .map((file) => file.slice(0, file.indexOf('/'))),
  );
  for (const set of sets) if (set !== keep) fs.remove(join(previewsDir, set));
}

type Target = { name: string; file: string; shot: PreviewShot };

/** A shot of each component's first shown example; deprecated ones are not offered by the pane. */
function componentTargets(
  components: readonly KitComponent[],
  shown: ReadonlySet<string>,
  folderDir: string,
): Target[] {
  const targets: Target[] = [];
  for (const [index, component] of components.entries()) {
    if (component.deprecated) continue;
    const at = component.examples.findIndex((_, n) => shown.has(exampleKey(component.name, n)));
    if (at === -1) continue;
    const file = componentFile(index);
    const search = `?example=${encodeURIComponent(exampleKey(component.name, at))}`;
    targets.push({
      name: component.name,
      file,
      shot: { search, target: EXAMPLE_ROOT, reach: true, out: join(folderDir, file) },
    });
  }
  return targets;
}

/**
 * Builds the catalog when it is not current, then shoots what the stamp does not cover yet.
 * `KIT_NOT_FOUND` and `KIT_INVALID` come from the build, `BROWSER_MISSING` without a browser, and
 * `PREVIEWS_FAILED` when the examples do not build.
 */
export async function makePreviews(
  deps: PreviewsDeps,
  kitId: string,
  project: string,
): Promise<PreviewsResult> {
  const { fs } = deps.render;
  const dir = catalogDir(project, kitId);
  const build = await buildCatalog(
    { kits: deps.kits, ...deps.render, kitWriter: deps.kitWriter },
    kitId,
    dir,
  );
  const stampText = build.built ? fs.readText(join(dir, CATALOG_STAMP)) : undefined;
  const catalog = readCatalogStamp(stampText);
  if (catalog === undefined) throw new KitvasError('PREVIEWS_FAILED', { id: kitId });

  const previous = readPreviewsStamp(fs.readText(join(dir, PREVIEWS_STAMP)));
  if (previous && previewsFresh(previous, kitId, catalog.key) && filesThere(fs, dir, previous)) {
    return resultOf(previous, dir, true, []);
  }

  const folder = previewFolder(catalog.key);
  const folderDir = join(dir, PREVIEWS_DIR, folder);
  // Files of an earlier try at this same build are not trusted: the set is shot whole.
  fs.remove(folderDir);
  const { kit } = requireKit(deps.kits, kitId);
  const targets = componentTargets(kit.components, new Set(catalog.shown), folderDir);
  const names = catalog.icons ?? [];
  const columns = sheetColumns(names.length);

  const shooter = await openShooter(deps.browser);
  let reports: ShotReport[];
  let sheet: ShotReport | undefined;
  try {
    const page = join(dir, CATALOG_PAGE);
    reports = await shooter.shoot({
      page,
      ...SHOT_VIEWPORT,
      scale: SHOT_SCALE,
      shots: targets.map((target) => target.shot),
    });
    if (names.length > 0) {
      const search = `?example=${encodeURIComponent(ICON_SHEET_KEY)}`;
      const out = join(folderDir, SHEET_FILE);
      [sheet] = await shooter.shoot({
        page,
        width: Math.max(SHOT_VIEWPORT.width, columns * SHEET_CELL + SHEET_ROOM),
        height: SHOT_VIEWPORT.height,
        scale: SHOT_SCALE,
        shots: [{ search, target: `[${ICON_SHEET_MARK}]`, reach: false, out }],
      });
    }
  } finally {
    await shooter.close();
  }

  const components: Record<string, string> = {};
  const failed: PreviewsResult['failed'] = [];
  // The backdrop of the first shot that read one; the sheet's when no component was shot.
  const backdrops: (string | null)[] = [];
  for (const [index, target] of targets.entries()) {
    const report = reports[index];
    if (report?.state === 'written') {
      components[target.name] = target.file;
      backdrops.push(report.backdrop);
    } else {
      const error = report?.state === 'failed' ? report.error : 'no shot was taken';
      failed.push({ component: target.name, error });
    }
  }
  if (sheet?.state === 'written') backdrops.push(sheet.backdrop);
  if (sheet?.state === 'failed') failed.push({ component: ICON_SHEET_KEY, error: sheet.error });
  const backdrop =
    backdrops.find((value): value is string => value !== null && BACKDROP.test(value)) ?? null;

  const stamp: PreviewsStamp = {
    schemaVersion: 1,
    kit: kitId,
    format: PREVIEWS_FORMAT,
    catalog: catalog.key,
    folder,
    backdrop,
    components,
    icons:
      sheet?.state === 'written' ? { file: SHEET_FILE, cell: SHEET_CELL, columns, names } : null,
  };
  // The stamp goes last: a half-made set never looks finished. Older sets go after it.
  fs.writeText(join(dir, PREVIEWS_STAMP), serializeJson(stamp));
  removeOtherSets(fs, join(dir, PREVIEWS_DIR), folder);
  return resultOf(stamp, dir, false, failed);
}
