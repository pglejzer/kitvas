// Use case: build the latest version of a draft into a page.

import { join } from 'node:path';
import {
  checkLayout,
  DEFAULT_STATES,
  type DraftStore,
  inspectLayout,
  StatesSchema,
  serializeJson,
} from '../../drafts/index.ts';
import {
  type KitStore,
  type KitWriter,
  type LoadedKit,
  syncGeneratedEntry,
  tokensToCss,
} from '../../kit/index.ts';
import { type Issue, KitvasError, PLUGIN_ROOT } from '../../shared/index.ts';
import { mountSource } from '../domain/mount.ts';
import { pageHtml } from '../domain/page.ts';
import {
  type BuildReport,
  buildFiles,
  TAILWIND_FILE,
  type TailwindFile,
} from '../domain/report.ts';
import { type ElementId, elementIds, idsFile, readSites, siteMap } from '../domain/sites.ts';
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

export type RenderDeps = {
  drafts: DraftStore;
  kits: KitStore;
  bundler: Bundler;
  styles: StylePipeline;
  fs: BuildFs;
  /** Files of kitvas that end up in every bundle; a change in them rebuilds. */
  runtimeFiles: string[];
  /** Utility CSS of Tailwind kits. */
  utility: UtilityCss;
  /** Writes a project kit's generated entry before the build reads it; without one it must exist. */
  kitWriter?: KitWriter | undefined;
  /**
   * Throws when the draft may not use the kit: a project kit whose last `kit verify` failed a step
   * that blocks drafts (ADR 0031). Called before anything is written.
   */
  kitGate?: ((kit: LoadedKit) => void) | undefined;
};

/** Bump when the shape of the build output changes, so old outputs are rebuilt. */
const OUTPUT_FORMAT = 3;

/** What the entry imports as `kitvas-frame`: the prototype's end of the studio channel. */
const FRAME_RUNTIME = join(PLUGIN_ROOT, 'client', 'frame', 'runtime.ts');

/** `utility`: the files the last utility build read; their contents are part of the key. */
type Stamp = { key: string; elements: number; utility: string[] };

function readStamp(text: string | undefined): Stamp | undefined {
  if (text === undefined) return undefined;
  try {
    const raw = JSON.parse(text) as { key?: unknown; elements?: unknown; utility?: unknown };
    if (typeof raw.key !== 'string' || typeof raw.elements !== 'number') return undefined;
    const utility =
      Array.isArray(raw.utility) && raw.utility.every((file) => typeof file === 'string')
        ? (raw.utility as string[])
        : [];
    return { key: raw.key, elements: raw.elements, utility };
  } catch {
    return undefined;
  }
}

export async function buildDraft(deps: RenderDeps, slug: string): Promise<BuildReport> {
  const { drafts, kits, bundler, styles, fs } = deps;
  const { draft, version, base, kit, issues } = inspectLayout(drafts, kits, slug);
  const first = issues[0];
  if (first) throw new KitvasError('DRAFT_INVALID', { slug, detail: first.path });
  deps.kitGate?.(kit);
  // Writes src/tsx/index.tsx and src/scss/index.scss from the layout.
  checkLayout(drafts, kits, slug);
  // A project kit's entry is generated from its catalog; it must be current before it is hashed.
  if (deps.kitWriter) syncGeneratedEntry(deps.kitWriter, kit);

  const versionDir = join(drafts.dir(slug), base);
  const sourceDir = join(versionDir, 'src');
  const tsxDir = join(sourceDir, 'tsx');
  const out = join(versionDir, 'build');
  const page = join(out, 'html', 'index.html');
  const stampFile = join(out, 'json', 'build.json');
  const report: BuildReport = {
    slug,
    version,
    built: true,
    cached: false,
    errors: [],
    warnings: [],
    elements: 0,
    files: buildFiles(base),
    path: page,
  };

  // The draft's sources, the kit, the project's component folder, kitvas's runtime and the files
  // the last utility build read.
  const fromProject = projectInputs(kit);
  const keyOf = (utilityFiles: string[]): string =>
    sourceHash(fs, {
      format: OUTPUT_FORMAT,
      kitHash: kit.hash,
      dirs: [sourceDir, kit.dir, ...fromProject.dirs],
      files: [...deps.runtimeFiles, ...fromProject.files, ...utilityFiles],
    });
  const previous = readStamp(fs.readText(stampFile));
  const before = keyOf(previous?.utility ?? []);
  if (previous?.key === before && fs.exists(page)) {
    return { ...report, cached: true, elements: previous.elements };
  }

  const ids: ElementId[] = [];
  const warnings: Issue[] = [];
  const tsxFiles = fs.listFiles(tsxDir).filter((name) => /\.tsx?$/.test(name));
  for (const relPath of tsxFiles.filter((name) => name.endsWith('.tsx'))) {
    const file = `src/tsx/${relPath}`;
    const code = await bundler.transform(fs.readText(join(tsxDir, relPath)) ?? '', file);
    // A file that does not parse gets no ids here; the bundle below reports its error.
    if (code === undefined) continue;
    const sites = readSites(code);
    if (sites) ids.push(...elementIds(file, sites));
    else warnings.push({ path: file, key: 'renderIssue.idsUnreadable', params: { file } });
  }

  const parsed = StatesSchema.safeParse(drafts.readJson(slug, `${base}/src/json/states.json`));
  const states = parsed.success ? parsed.data : DEFAULT_STATES;
  const { runtime } = kit.kit;
  const bundle = await bundler.bundle({
    workingDir: versionDir,
    entry: {
      name: 'kitvas-mount.tsx',
      source: mountSource({
        providers: mountProviders(fs, kit),
        states: states.states.map((state) => state.id),
        defaultState: states.default,
      }),
    },
    alias: {
      // The kit's entry, or the one kitvas writes for a built-in kit with additions.
      '@kit': kit.entry,
      '@draft': join(tsxDir, 'index.tsx'),
      'kitvas-frame': FRAME_RUNTIME,
    },
    ids: siteMap(ids),
    project: kit.project,
  });
  const utility = await utilityBuild(
    deps.utility,
    fs,
    kit,
    tsxFiles.map((relPath) => join(tsxDir, relPath)),
    probeNames(kit),
  );
  const kitSheets = await styles.compile(
    runtime.styles.files.map((file) => join(kit.dir, file)),
    versionDir,
  );
  const draftSheets = await styles.compile([join(sourceDir, 'scss', 'index.scss')], versionDir);

  const errors = [
    ...bundle.errors,
    ...(utility?.errors ?? []),
    ...kitSheets.errors,
    ...draftSheets.errors,
  ];
  if (errors.length > 0) {
    // The old page stays, but it no longer counts as up to date.
    fs.remove(stampFile);
    return { ...report, built: false, errors, warnings };
  }

  // Tokens, utility CSS, the kit's style files, what the bundled modules imported, the draft.
  const css = joinSheets([
    tokensToCss(kit.tokens, ':root', kit.cssVarMap),
    utility?.css ?? '',
    kitSheets.css,
    bundle.css,
    draftSheets.css,
  ]);
  fs.writeText(join(out, 'js', 'index.js'), bundle.js);
  fs.writeText(join(out, 'css', 'index.css'), `${css}\n`);
  fs.writeText(page, pageHtml({ title: draft.title }));
  fs.writeText(join(out, 'json', 'ids.json'), serializeJson(idsFile(ids)));
  const tailwindFile = join(versionDir, ...TAILWIND_FILE.split('/'));
  if (utility) {
    const unexplained: TailwindFile = { schemaVersion: 1, unknown: utility.unknown };
    fs.writeText(tailwindFile, serializeJson(unexplained));
  } else {
    fs.remove(tailwindFile);
  }
  fs.remove(join(out, 'img'));
  fs.copyDir(join(sourceDir, 'img'), join(out, 'img'));
  const utilityFiles = utility?.files ?? [];
  const key = sameFiles(utilityFiles, previous?.utility ?? []) ? before : keyOf(utilityFiles);
  fs.writeText(
    stampFile,
    serializeJson({ schemaVersion: 1, key, elements: ids.length, utility: utilityFiles }),
  );
  return { ...report, warnings, elements: ids.length };
}
