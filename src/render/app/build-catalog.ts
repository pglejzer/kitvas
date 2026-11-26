// Use case: build the examples of a kit into one page the studio shows in frames.

import { join } from 'node:path';
import { serializeJson } from '../../drafts/index.ts';
import {
  type KitStore,
  type KitWriter,
  type LoadedKit,
  requireKit,
  syncGeneratedEntry,
  tokenSheet,
} from '../../kit/index.ts';
import { PLUGIN_ROOT } from '../../shared/index.ts';
import {
  type CatalogExample,
  catalogCss,
  catalogMountSource,
  exampleFunction,
  examplesSource,
} from '../domain/catalog-mount.ts';
import {
  CATALOG_PAGE,
  CATALOG_STAMP,
  type CatalogStamp,
  exampleKey,
  readCatalogStamp,
} from '../domain/catalog-stamp.ts';
import { iconSheet } from '../domain/icon-sheet.ts';
import { pageHtml } from '../domain/page.ts';
import type { BuildError } from '../domain/report.ts';
import type { BuildFs } from '../ports/build-fs.ts';
import type { Bundler } from '../ports/bundler.ts';
import type { StylePipeline } from '../ports/style-pipeline.ts';
import type { UtilityCss } from '../ports/utility-css.ts';
import {
  joinSheets,
  mountProviders,
  probeNames,
  projectInputs,
  sameFiles,
  utilityBuild,
} from './project-kit.ts';
import { sourceHash } from './source-hash.ts';

export type CatalogDeps = {
  kits: KitStore;
  bundler: Bundler;
  styles: StylePipeline;
  fs: BuildFs;
  /** Files of kitvas that end up in the bundle; a change in them rebuilds. */
  runtimeFiles: string[];
  /** Utility CSS of Tailwind kits. */
  utility: UtilityCss;
  /** Writes a project kit's generated entry before the build reads it; without one it must exist. */
  kitWriter?: KitWriter | undefined;
};

export type CatalogOptions = {
  /** Custom properties a Tailwind kit's CSS must define even when no class uses them. */
  probe?: string[] | undefined;
};

export type CatalogReport = {
  id: string;
  /** False when the bundle or the styles had errors; the previous output is left as it was. */
  built: boolean;
  /** True when nothing changed since the last good build and no work was done. */
  cached: boolean;
  /** Example keys in the bundle. */
  shown: string[];
  /** Example keys whose code does not parse. */
  skipped: string[];
  errors: BuildError[];
  /** Absolute path of the page. */
  path: string;
};

/** Bump when the shape of the catalog output changes, so old outputs are rebuilt (5: icon sheet). */
const CATALOG_FORMAT = 5;

/** What the entry imports as `kitvas-example`: the example's end of the studio channel. */
const EXAMPLE_RUNTIME = join(PLUGIN_ROOT, 'client', 'frame', 'page', 'example.ts');

/** Inside the catalog folder: the examples alone, where a utility build reads their class names. */
const EXAMPLES_SOURCE = join('build', 'json', 'examples.tsx');

/** The disk and the runtime files are all a key needs; the bundler and the styles are not. */
export type CatalogKeyDeps = Pick<CatalogDeps, 'kits' | 'fs' | 'runtimeFiles'>;

/** The hash of everything a catalog build of `loaded` reads, with the utility files of one build. */
function catalogHash(
  deps: CatalogKeyDeps,
  loaded: LoadedKit,
  probe: string[],
  utilityFiles: string[],
): string {
  const fromProject = projectInputs(loaded);
  return sourceHash(deps.fs, {
    format: CATALOG_FORMAT,
    kitHash: loaded.hash,
    dirs: [loaded.dir, ...fromProject.dirs],
    files: [...deps.runtimeFiles, ...fromProject.files, ...utilityFiles],
    settings: { probe },
  });
}

/**
 * The key a catalog build of the kit would compare now, without building or writing anything: the
 * stamp's key when nothing changed since the last good build (ADR 0075). A project kit's generated
 * entry is not written first, so one that is out of date gives another key, and the next build
 * writes it. A kit that cannot be built throws as `buildCatalog` does.
 */
export function currentCatalogKey(
  deps: CatalogKeyDeps,
  kitId: string,
  dir: string,
  options: CatalogOptions = {},
): string {
  const loaded = requireKit(deps.kits, kitId);
  const previous = readCatalogStamp(deps.fs.readText(join(dir, CATALOG_STAMP)));
  return catalogHash(deps, loaded, probeNames(loaded, options.probe), previous?.utility ?? []);
}

/**
 * `dir` is the kit's catalog folder (`catalogDir`). Only `<dir>/build/` is written; other files of
 * the folder, such as `verify.json`, stay.
 */
export async function buildCatalog(
  deps: CatalogDeps,
  kitId: string,
  dir: string,
  options: CatalogOptions = {},
): Promise<CatalogReport> {
  const { kits, bundler, styles, fs } = deps;
  const loaded = requireKit(kits, kitId);
  // A project kit's entry is generated from its catalog; it must be current before it is hashed.
  if (deps.kitWriter) syncGeneratedEntry(deps.kitWriter, loaded);
  const { kit } = loaded;
  const page = join(dir, CATALOG_PAGE);
  const stampFile = join(dir, CATALOG_STAMP);
  const report: CatalogReport = {
    id: kitId,
    built: true,
    cached: false,
    shown: [],
    skipped: [],
    errors: [],
    path: page,
  };

  const probe = probeNames(loaded, options.probe);
  const keyOf = (utilityFiles: string[]): string => catalogHash(deps, loaded, probe, utilityFiles);
  const previous = readCatalogStamp(fs.readText(stampFile));
  const before = keyOf(previous?.utility ?? []);
  if (previous?.key === before && previous.kit === kitId && fs.exists(page)) {
    return { ...report, cached: true, shown: previous.shown, skipped: previous.skipped };
  }

  // Each example is compiled alone, in the same wrapper the entry uses, so one that does not
  // parse is left out instead of failing the whole bundle.
  const examples: CatalogExample[] = [];
  const references = new Map<string, string>();
  const skipped: string[] = [];
  for (const component of kit.components) {
    for (const [index, example] of component.examples.entries()) {
      const exampleId = exampleKey(component.name, index);
      const parsed = await bundler.transform(
        exampleFunction('KitvasCheck', example.code),
        `${exampleId}.tsx`,
      );
      if (parsed === undefined) skipped.push(exampleId);
      else {
        examples.push({ key: exampleId, code: example.code });
        if (example.reference !== undefined) references.set(exampleId, example.reference);
      }
    }
  }
  const shown = examples.map((example) => example.key);
  // The editor's Insert pane shows the icons from one shot of this grid (ADR 0075).
  const sheet = kit.icons?.source === 'component' ? iconSheet(kit.icons) : undefined;

  // esbuild is given the folder as its working directory; make sure it exists on a first build.
  if (!fs.exists(dir)) fs.writeText(join(dir, 'build', 'json', '.gitkeep'), '');

  const { runtime } = kit;
  const bundle = await bundler.bundle({
    workingDir: dir,
    entry: {
      name: 'kitvas-catalog.tsx',
      source: catalogMountSource({
        providers: mountProviders(fs, loaded),
        components: kit.components.map((component) => component.name),
        examples,
        sheet,
      }),
    },
    alias: {
      // The kit's entry, or the one kitvas writes for a built-in kit with additions.
      '@kit': loaded.entry,
      'kitvas-example': EXAMPLE_RUNTIME,
    },
    ids: {},
    project: loaded.project,
  });
  const own: string[] = [];
  if (runtime.styles.tailwind) {
    const file = join(dir, EXAMPLES_SOURCE);
    fs.writeText(file, examplesSource(examples));
    own.push(file);
  }
  const utility = await utilityBuild(deps.utility, fs, loaded, own, probe);
  const sheets = await styles.compile(
    runtime.styles.files.map((file) => join(loaded.dir, file)),
    dir,
  );

  const errors = [...bundle.errors, ...(utility?.errors ?? []), ...sheets.errors];
  if (errors.length > 0) {
    // The old page stays, but it no longer counts as up to date.
    fs.remove(stampFile);
    return { ...report, built: false, shown, skipped, errors };
  }

  const utilityFiles = utility?.files ?? [];
  const key = sameFiles(utilityFiles, previous?.utility ?? []) ? before : keyOf(utilityFiles);
  const stamp: CatalogStamp = {
    schemaVersion: 1,
    kit: kitId,
    key,
    shown,
    skipped,
    utility: utilityFiles,
    ...(sheet ? { icons: sheet.names } : {}),
  };
  fs.writeText(join(dir, 'build', 'js', 'index.js'), bundle.js);
  fs.writeText(
    join(dir, 'build', 'css', 'index.css'),
    catalogCss(tokenSheet(loaded), joinSheets([utility?.css ?? '', sheets.css, bundle.css])),
  );
  // The images the examples should look like, for the studio's kit page; a missing file is skipped.
  fs.remove(join(dir, 'build', 'img', 'refs'));
  for (const [key, reference] of references) {
    const extension = reference.slice(reference.lastIndexOf('.'));
    fs.copyFile(
      join(loaded.dir, ...reference.split('/')),
      join(dir, 'build', 'img', 'refs', `${key}${extension}`),
    );
  }
  fs.writeText(page, pageHtml({ title: `${kit.name} examples` }));
  // The stamp goes last: a half-written build never looks finished.
  fs.writeText(stampFile, serializeJson(stamp));
  return { ...report, shown, skipped };
}
