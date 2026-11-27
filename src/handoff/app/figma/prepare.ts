// Use case: the hand-over package of a draft for Figma (plan 21, goals A1, A5, A6). It measures the
// built page, shapes the layer tree, binds the kit's tokens, writes the scripts and the images as
// files under the draft's version, and opens no network connection. The skill sends the files.

import { join } from 'node:path';
import {
  LAYERS_NODE_CAP,
  type LayerFacts,
  type MeasuredLayers,
  readChecks,
} from '../../../checks/index.ts';
import { type DraftStore, inspectLayout, versionFolder } from '../../../drafts/index.ts';
import type { FlatToken, KitStore } from '../../../kit/index.ts';
import type { Bundler, IdsFile } from '../../../render/index.ts';
import { KitvasError, type Translate, z } from '../../../shared/index.ts';
import type { FigmaManifest, FigmaPackage } from '../../domain/figma/manifest.ts';
import { FIGMA_SCRIPT_LIMIT, figmaScripts } from '../../domain/figma/scripts/scripts.ts';
import { shapeTree } from '../../domain/figma/shape.ts';
import { tokenUses } from '../../domain/figma/token-uses.ts';
import {
  BOUND,
  type BoundProperty,
  type HandoffTree,
  type TreeFrame,
} from '../../domain/figma/tree.ts';
import { type FigmaVariable, figmaVariables } from '../../domain/figma/variables.ts';
import { SEND_ID } from '../../domain/record.ts';
import type { HandoffFiles, PackageFile } from '../../ports/handoff-files.ts';
import { readRecord } from '../record.ts';
import { draftStates } from '../states.ts';
import { collectAssets, type LeftOut } from './assets.ts';
import { bundleFigmaBuilder } from './bundle.ts';

/** Where the package is, inside a version's folder. */
export const figmaPackageDir = (base: string): string => `${base}/handoff/figma`;

export type PrepareFigmaDeps = {
  drafts: DraftStore;
  kits: KitStore;
  files: HandoffFiles;
  /** The checks module's `measureLayers`, over the render tools and the browser. */
  measure(input: { slug: string; state: string; widths: number[] }): Promise<MeasuredLayers>;
  /** The render tools' bundler: it makes the builder a plain script. */
  bundler: Bundler;
  /** A fresh send id, matching SEND_ID. */
  newSendId(): string;
  t: Translate;
};

export type PrepareFigmaInput = {
  slug: string;
  widths: number[];
  /** '' is the draft's baseline state. */
  state: string;
  sections: string[] | null;
  resume: boolean;
};

/** The answer: the package, and the images and large SVGs that could not go in it. */
export type PreparedFigma = FigmaPackage & { leftOut: LeftOut[] };

const json = (value: unknown, space?: number): string => `${JSON.stringify(value, null, space)}\n`;

const invalid = (at: string, reason: string): KitvasError =>
  new KitvasError('HANDOFF_INVALID', { at, reason });

function readIds(drafts: DraftStore, slug: string, base: string): IdsFile {
  const parsed = z
    .object({
      ids: z.record(
        z.string(),
        z.object({ file: z.string(), line: z.number(), column: z.number(), tag: z.string() }),
      ),
    })
    .safeParse(drafts.readJson(slug, `${base}/build/json/ids.json`));
  return { schemaVersion: 1, ids: parsed.success ? parsed.data.ids : {} };
}

/** `none`, `stale`, `findings` or `clean`: the date of the shots against the date of the sources. */
function checksOf(drafts: DraftStore, slug: string, version: number): FigmaPackage['checks'] {
  const file = readChecks(drafts, slug, version);
  if (file === undefined) return { state: 'none', errors: 0, warnings: 0 };
  const base = versionFolder(version);
  const shots = drafts.modifiedAt(slug, `${base}/build/shots`);
  const source = drafts.modifiedAt(slug, `${base}/src`);
  const errors = file.summary.fix;
  const warnings = file.summary.review;
  if (shots === undefined || (source !== undefined && source > shots)) {
    return { state: 'stale', errors, warnings };
  }
  return { state: errors + warnings === 0 ? 'clean' : 'findings', errors, warnings };
}

function earlierSends(drafts: DraftStore, slug: string): FigmaPackage['earlier'] {
  const earlier: FigmaPackage['earlier'] = [];
  for (const send of readRecord(drafts, slug).sends) {
    if (send.target === 'figma') {
      earlier.push({ at: send.at, version: send.version, url: send.file.url, state: send.state });
    }
  }
  return earlier;
}

function boundOf(frames: readonly TreeFrame[]): Map<string, Set<BoundProperty>> {
  const bound = new Map<string, Set<BoundProperty>>();
  for (const frame of frames) {
    for (const section of frame.sections) {
      for (const layer of section.layers) {
        for (const property of BOUND) {
          const name = layer.bound[property];
          if (name === undefined) continue;
          const set = bound.get(name) ?? new Set<BoundProperty>();
          set.add(property);
          bound.set(name, set);
        }
      }
    }
  }
  return bound;
}

/** The page's own files never name the machine: an image paint carries its asset's name, or nothing. */
function withoutSources(tree: HandoffTree): HandoffTree {
  return {
    ...tree,
    frames: tree.frames.map((frame) => ({
      ...frame,
      sections: frame.sections.map((section) => ({
        ...section,
        layers: section.layers.map((layer) => ({
          ...layer,
          node: {
            ...layer.node,
            paints: layer.node.paints.map((paint) =>
              paint.kind === 'image' ? { ...paint, src: layer.asset ?? '' } : paint,
            ),
          },
        })),
      })),
    })),
  };
}

function recount(tree: HandoffTree): HandoffTree['counts'] {
  const counts = { layers: 0, texts: 0, images: 0, icons: 0 };
  for (const frame of tree.frames) {
    for (const section of frame.sections) {
      for (const { node } of section.layers) {
        counts.layers += 1;
        if (node.kind === 'text') counts.texts += 1;
        else if (node.kind === 'image') counts.images += 1;
        else if (node.kind === 'svg') counts.icons += 1;
      }
    }
  }
  return counts;
}

/**
 * A width the walk cut at the node cap: refused, with the largest sections named. `--sections`
 * lets a part through when each chosen section lies before the cut, so it was walked whole.
 */
function refuseTooLarge(
  deps: PrepareFigmaDeps,
  slug: string,
  frames: readonly TreeFrame[],
  facts: readonly { width: number; facts: LayerFacts }[],
  chosen: readonly string[] | null,
): void {
  const cut = facts.findIndex((entry) => entry.facts.truncated);
  const frame = frames[cut];
  if (cut < 0 || frame === undefined) return;
  const filled = frame.sections.filter((section) => section.layers.length > 0);
  const whole = filled.slice(0, -1).map((section) => section.id);
  if (chosen?.every((id) => whole.includes(id))) return;
  const largest = [...filled]
    .sort((a, b) => b.layers.length - a.layers.length)
    .slice(0, 3)
    .map((section) => `${section.id} (${section.layers.length})`)
    .join(', ');
  const detail = deps.t('handoff.tooLarge.detail', {
    width: frame.width,
    cap: LAYERS_NODE_CAP,
    sections: largest,
  });
  throw new KitvasError('HANDOFF_TOO_LARGE', { slug, detail });
}

/** What the answer needs of a tree: a tree read back from disk is only this much checked. */
type TreeSummary = Pick<HandoffTree, 'state' | 'sendId' | 'counts' | 'unbound' | 'fonts'> & {
  frames: { width: number; sections: { id: string }[] }[];
};

type Written = {
  slug: string;
  version: number;
  kit: string;
  tree: TreeSummary;
  variables: number;
  scripts: number;
  characters: number;
  dir: string;
};

function describe(deps: PrepareFigmaDeps, written: Written, leftOut: LeftOut[]): PreparedFigma {
  const { tree } = written;
  const weights = new Map<string, Set<number>>();
  for (const font of tree.fonts) {
    weights.set(font.family, (weights.get(font.family) ?? new Set<number>()).add(font.weight));
  }
  const sections = new Set(tree.frames.flatMap((frame) => frame.sections.map((s) => s.id)));
  return {
    slug: written.slug,
    version: written.version,
    kit: written.kit,
    state: tree.state,
    sendId: tree.sendId,
    dir: written.dir,
    manifest: join(written.dir, 'manifest.json'),
    widths: tree.frames.map((frame) => frame.width),
    counts: {
      ...tree.counts,
      sections: sections.size,
      variables: written.variables,
      scripts: written.scripts,
      characters: written.characters,
    },
    unbound: tree.unbound,
    fonts: [...weights]
      .map(([family, set]) => ({ family, weights: [...set].sort((a, b) => a - b) }))
      .sort((a, b) => a.family.localeCompare(b.family)),
    checks: checksOf(deps.drafts, written.slug, written.version),
    earlier: earlierSends(deps.drafts, written.slug),
    leftOut,
  };
}

const ManifestDisk = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int(),
  kit: z.string(),
  sendId: z.string().regex(SEND_ID),
  page: z.string(),
  frames: z.array(z.object({ width: z.number(), name: z.string() })),
  steps: z.array(
    z.union([
      z.object({
        kind: z.literal('script'),
        file: z.string(),
        description: z.string(),
        writes: z.boolean(),
      }),
      z.object({
        kind: z.literal('assets'),
        targets: z.string(),
        items: z.array(z.object({ file: z.string(), contentType: z.string() })),
      }),
    ]),
  ),
});
const TreeDisk = z.object({
  schemaVersion: z.literal(1),
  state: z.string(),
  sendId: z.string().regex(SEND_ID),
  frames: z.array(
    z.object({
      width: z.number(),
      height: z.number(),
      background: z.string(),
      sections: z.array(z.object({ id: z.string() })),
    }),
  ),
  fonts: z.array(z.object({ family: z.string(), weight: z.number(), italic: z.boolean() })),
  counts: z.object({
    layers: z.number(),
    texts: z.number(),
    images: z.number(),
    icons: z.number(),
  }),
  unbound: z.number(),
});

function readOnDisk(deps: PrepareFigmaDeps, slug: string, base: string, file: string): unknown {
  try {
    return deps.drafts.readJson(slug, `${figmaPackageDir(base)}/${file}`);
  } catch (error) {
    if (error instanceof KitvasError) throw invalid('resume', file);
    throw error;
  }
}

/** `--resume`: the package that is on disk, with its send id; nothing is measured or written. */
function resumePackage(deps: PrepareFigmaDeps, slug: string, version: number, base: string) {
  const manifestRaw = readOnDisk(deps, slug, base, 'manifest.json');
  if (manifestRaw === undefined) throw invalid('resume', 'no package');
  const manifest = ManifestDisk.safeParse(manifestRaw);
  const tree = TreeDisk.safeParse(readOnDisk(deps, slug, base, 'tree.json'));
  const variables = z.array(z.unknown()).safeParse(readOnDisk(deps, slug, base, 'variables.json'));
  if (!manifest.success || !tree.success || !variables.success) throw invalid('resume', 'package');
  if (manifest.data.version !== version) throw invalid('resume', 'older version');
  let characters = 0;
  let scripts = 0;
  for (const step of manifest.data.steps) {
    if (step.kind !== 'script') continue;
    const text = deps.drafts.readText(slug, `${figmaPackageDir(base)}/scripts/${step.file}`);
    if (text === undefined) throw invalid('resume', `missing ${step.file}`);
    characters += text.length;
    scripts += 1;
  }
  const written: Written = {
    slug,
    version,
    kit: manifest.data.kit,
    tree: tree.data,
    variables: variables.data.length,
    scripts,
    characters,
    dir: join(deps.drafts.dir(slug), figmaPackageDir(base)),
  };
  return describe(deps, written, []);
}

/**
 * HANDOFF_BUILD_FAILED when the draft does not build, HANDOFF_TOO_LARGE when a width hit the layer
 * cap, HANDOFF_INVALID for an unknown state or section and for `--resume` with no package.
 */
export async function prepareFigma(
  deps: PrepareFigmaDeps,
  input: PrepareFigmaInput,
): Promise<PreparedFigma> {
  const { slug } = input;
  const inspected = inspectLayout(deps.drafts, deps.kits, slug);
  const { version, base } = inspected;
  if (input.resume) return resumePackage(deps, slug, version, base);

  const states = draftStates(deps.drafts, slug, base);
  const state = input.state === '' ? states.baseline : input.state;
  if (!states.ids.includes(state)) throw invalid('state', state);
  const layoutIds = inspected.layout.sections.map((section) => section.id);
  for (const id of input.sections ?? []) {
    if (!layoutIds.includes(id)) throw invalid('sections', id);
  }

  const measured = await deps.measure({ slug, state, widths: input.widths });
  if (!measured.built || measured.frames.length === 0) {
    throw new KitvasError('HANDOFF_BUILD_FAILED', { slug });
  }

  const draftDir = deps.drafts.dir(slug);
  const versionDir = join(draftDir, base);
  const srcs = measured.frames.flatMap((frame) =>
    frame.facts.nodes.flatMap((node) =>
      node.paints.flatMap((paint) => (paint.kind === 'image' ? [paint.src] : [])),
    ),
  );
  const assets = collectAssets(
    { files: deps.files },
    { root: draftDir, pageDir: join(versionDir, 'build', 'html'), srcs },
  );
  const tokens: readonly FlatToken[] = inspected.kit.tokens;
  const sendId = deps.newSendId();
  const shaped = shapeTree({
    slug,
    version: measured.version,
    kit: inspected.draft.kit.id,
    state,
    sendId,
    frames: measured.frames,
    ids: readIds(deps.drafts, slug, base),
    sections: layoutIds,
    tokens,
    uses: tokenUses(deps.drafts.readText(slug, `${base}/build/css/index.css`) ?? ''),
    assetOf: (src) => assets.names.get(src) ?? null,
  });
  refuseTooLarge(deps, slug, shaped.frames, measured.frames, input.sections);

  const chosen = input.sections;
  const filtered: HandoffTree =
    chosen === null
      ? shaped
      : {
          ...shaped,
          frames: shaped.frames.map((frame) => ({
            ...frame,
            sections: frame.sections.filter((section) => chosen.includes(section.id)),
          })),
        };
  const tree = withoutSources(
    chosen === null ? filtered : { ...filtered, counts: recount(filtered) },
  );
  const variables: FigmaVariable[] = figmaVariables(tokens, boundOf(tree.frames));
  const builder = await bundleFigmaBuilder({ bundler: deps.bundler });
  const { scripts, steps } = figmaScripts(tree, variables, builder, { limit: FIGMA_SCRIPT_LIMIT });

  const manifest: FigmaManifest = {
    schemaVersion: 1,
    slug,
    version: measured.version,
    kit: tree.kit,
    sendId,
    page: `kitvas · ${slug}`,
    frames: tree.frames.map((frame) => ({
      width: frame.width,
      name: `${slug} v${measured.version} · ${frame.width} · ${sendId}`,
    })),
    steps,
  };
  const files: PackageFile[] = [
    { path: 'tree.json', content: json(tree) },
    { path: 'variables.json', content: json(variables, 2) },
    { path: 'manifest.json', content: json(manifest, 2) },
    ...scripts.map((script) => ({ path: `scripts/${script.file}`, content: script.code })),
    ...assets.files,
  ];
  const dir = join(draftDir, figmaPackageDir(base));
  deps.files.replaceFolder(dir, files);

  const svgLarge: LeftOut[] = tree.frames.flatMap((frame) =>
    frame.sections.flatMap((section) =>
      section.layers.flatMap((layer) =>
        layer.node.kind === 'svg' && layer.node.svg === null
          ? [{ what: 'svg', reason: 'svg-large' as const }]
          : [],
      ),
    ),
  );
  return describe(
    deps,
    {
      slug,
      version: measured.version,
      kit: tree.kit,
      tree,
      variables: variables.length,
      scripts: scripts.length,
      characters: scripts.reduce((sum, script) => sum + script.code.length, 0),
      dir,
    },
    [...assets.leftOut, ...svgLarge],
  );
}
