// Use case: `kitvas handoff brief`. Reads a draft's own files and its kit and writes what the
// fitter is handed: `brief.json` (the draft, the components and tokens it uses, the write set),
// `target.json` (the facts of the project) and `before.json` (the project's listing before anything
// is written). Everything is written inside the draft's version folder; nothing in the project.

import { idEntries } from '../../../checks/index.ts';
import {
  type DraftStore,
  type InspectedLayout,
  inspectLayout,
  pascalCase,
  pickedFinal,
  sectionPaths,
  serializeJson,
  sketchFile,
} from '../../../drafts/index.ts';
import {
  cssVarName,
  formatTokenValue,
  type KitStore,
  type LoadedKit,
  type ProjectSetup,
} from '../../../kit/index.ts';
import type { IdsFile } from '../../../render/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import type { CodeBrief } from '../../domain/code/brief.ts';
import type { ProjectListing, WriteSet } from '../../domain/code/listing.ts';
import { isInsideProject, isProtectedPath, normalizeFolder } from '../../domain/code/scope.ts';
import type { TargetFacts } from '../../domain/code/target.ts';
import { componentUses, tokenUsesOf, type UseSource } from '../../domain/code/uses.ts';
import { listProject } from './list-project.ts';
import { readTarget } from './read-target.ts';

export type BriefDeps = {
  drafts: DraftStore;
  kits: KitStore;
  files: ProjectSetup;
  /** The text of `.kitvas/decisions.md`; undefined when there is none. */
  decisions(): string | undefined;
  /** Absolute path of the plugin's `reference/handoff-code.md`: the one path of the brief outside the project. */
  rules: string;
  /** The facts and the listing of the project; the real ones unless a test hands in its own. */
  target?: (deps: { files: ProjectSetup }, input: { base: string }) => TargetFacts;
  listing?: (deps: { files: ProjectSetup }, input: { base: string }) => ProjectListing;
};

export type BriefInput = {
  slug: string;
  write: WriteSet;
  /** The folder of the project to read, from its root; '' for the root. */
  base: string;
  /** Take the listing again even when `before.json` is there. */
  again?: boolean;
};

const DRAFTS = '.kitvas/drafts';
const CODE_FOLDER = 'handoff/code';
const SHOT = /^([^/]+)-(\d+)\.png$/;
const DATE = /\s+\(\d{4}-\d{2}-\d{2}\)\s*$/;
const GENERATED_ENTRY = 'src/tsx/index.tsx';

const invalid = (at: string, reason: string): KitvasError =>
  new KitvasError('HANDOFF_INVALID', { at, reason });

/** The lines under `## Handoff` of the decisions file, one per bullet, without the date. */
export function handoffDecisions(text: string | undefined): string[] {
  if (text === undefined) return [];
  const lines: string[] = [];
  let inside = false;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      inside = heading[1] === 'Handoff';
      continue;
    }
    if (/^#{1,2}\s/.test(line)) inside = false;
    const bullet = inside ? /^-\s+(.*)$/.exec(line) : null;
    const entry = (bullet?.[1] ?? '').replace(DATE, '').trim();
    if (entry !== '') lines.push(entry);
  }
  return lines;
}

/** The write set as the brief keeps it, every path checked: inside the project and not protected. */
function checkedWrite(deps: BriefDeps, write: WriteSet): WriteSet {
  const to = normalizeFolder(write.to);
  if (to !== '' && (!isInsideProject(to) || isProtectedPath(to))) {
    throw new KitvasError('HANDOFF_OUTSIDE', { path: write.to });
  }
  const files: string[] = [];
  for (const given of write.files) {
    const file = given.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    if (!isInsideProject(file) || isProtectedPath(file)) {
      throw new KitvasError('HANDOFF_OUTSIDE', { path: given });
    }
    if (!deps.files.exists(file)) throw invalid('files', `no such file in the project: ${file}`);
    if (!deps.files.realInside(file)) throw new KitvasError('HANDOFF_OUTSIDE', { path: given });
    files.push(file);
  }
  return { to, scope: write.scope, files };
}

/** The ids of the build without the generated entry, whose imports are not the draft's own. */
function builtIds(drafts: DraftStore, slug: string, base: string): IdsFile {
  const raw = drafts.readJson(slug, `${base}/build/json/ids.json`);
  if (raw === undefined) throw new KitvasError('HANDOFF_BUILD_FAILED', { slug });
  const entries = idEntries(raw).filter((entry) => entry.file !== GENERATED_ENTRY);
  return {
    schemaVersion: 1,
    ids: Object.fromEntries(
      entries.map(({ id, file, line, column, tag }) => [id, { file, line, column, tag }]),
    ),
  };
}

/**
 * Where a kit component's module is in the project, for a kit learned from a package or a folder:
 * `@mui/material#Button`, or the module alone when the kit names no export.
 */
function projectModule(loaded: LoadedKit, name: string): string | null {
  const { source } = loaded.kit;
  if (source.type !== 'npm' && source.type !== 'repo') return null;
  const component = loaded.kit.components.find((candidate) => candidate.name === name);
  if (component === undefined) return null;
  const { from, name: exported } = component.import;
  return exported === undefined ? from : `${from}#${exported}`;
}

function originOf(loaded: LoadedKit, name: string): 'kit' | 'addition' | 'draft' {
  if (loaded.additions.includes(name)) return 'addition';
  return loaded.kit.components.some((component) => component.name === name) ? 'kit' : 'draft';
}

type Own = {
  kind: CodeBrief['kind'];
  layout: string | null;
  sections: CodeBrief['draft']['sections'];
  /** Paths inside the draft of the section files, which the sources start from. */
  tsx: string[];
  scss: string[];
};

/** The draft's sections by kind: a screen's and a rework's from the layout, a craft's from the pick. */
function ownFiles(deps: BriefDeps, inspected: InspectedLayout, root: string): Own {
  const { slug } = inspected.draft;
  const { draft, base, version } = inspected;
  const at = (rel: string): string => `${root}/${rel}`;
  const whyOf = (name: string): string | null => {
    const rel = `${base}/why/${name}.json`;
    return deps.drafts.exists(slug, rel) ? at(rel) : null;
  };

  if (draft.kind === 'craft') {
    const final = pickedFinal(deps.drafts, slug);
    const tsx = sketchFile(version, final.sketch);
    return {
      kind: 'craft',
      layout: null,
      sections: [{ id: final.name, tsx: at(tsx), scss: null, why: whyOf(final.sketch) }],
      tsx: [tsx],
      scss: [],
    };
  }
  const { sections } = inspected.layout;
  if (sections.length === 0) throw invalid('layout', 'the draft has no sections');
  const paths = sections.map((section) => ({ id: section.id, ...sectionPaths(base, section.id) }));
  const layout = `${base}/md/layout.md`;
  return {
    kind: draft.kind,
    layout: deps.drafts.exists(slug, layout) ? at(layout) : null,
    sections: paths.map(({ id, tsx, scss }) => ({
      id,
      tsx: at(tsx),
      scss: deps.drafts.exists(slug, scss) ? at(scss) : null,
      why: whyOf(pascalCase(id)),
    })),
    tsx: paths.map((path) => path.tsx),
    scss: paths.flatMap((path) => (deps.drafts.exists(slug, path.scss) ? [path.scss] : [])),
  };
}

/** The files of a folder of the draft, each as a path from the project root. */
function listed(deps: BriefDeps, root: string, folder: string): string[] {
  return deps.files.listFiles(`${root}/${folder}`).map((rel) => `${root}/${folder}/${rel}`);
}

/**
 * The draft's own code of one kind: the section files, plus any other file of the version with that
 * ending (a part a section imports). The generated entry is left out, and in a craft draft so is
 * every sketch but the picked one.
 */
function codeOf(
  deps: BriefDeps,
  input: { slug: string; root: string; base: string; folder: string; ending: string },
  own: Own,
  known: readonly string[],
): UseSource[] {
  const { slug, root, base, folder, ending } = input;
  const extra = deps.files
    .listFiles(`${root}/${base}/src/${folder}`)
    .filter((rel) => rel.endsWith(ending) && rel !== `index${ending}`)
    .map((rel) => ({ rel, path: `${base}/src/${folder}/${rel}` }))
    .filter(({ rel, path }) => {
      const sketch = own.kind === 'craft' && rel.startsWith('sketches/');
      return !sketch || known.includes(path);
    })
    .map(({ path }) => path);
  return [...new Set([...known, ...extra])].flatMap((path) => {
    const text = deps.drafts.readText(slug, path);
    return text === undefined ? [] : [{ path, text }];
  });
}

export function writeBrief(
  deps: BriefDeps,
  input: BriefInput,
): { brief: CodeBrief; dir: string; listed: boolean } {
  const { slug } = input;
  const write = checkedWrite(deps, input.write);
  const inspected = inspectLayout(deps.drafts, deps.kits, slug);
  const { draft, version, base, kit: loaded } = inspected;
  const root = `${DRAFTS}/${slug}`;
  const dir = `${root}/${base}/${CODE_FOLDER}`;
  const own = ownFiles(deps, inspected, root);
  const ids = builtIds(deps.drafts, slug, base);

  const at = { slug, root, base };
  const tsx = codeOf(deps, { ...at, folder: 'tsx', ending: '.tsx' }, own, own.tsx);
  const scss = codeOf(deps, { ...at, folder: 'scss', ending: '.scss' }, own, own.scss);

  const components = componentUses({ ids, sources: tsx }).map((used) => {
    const origin = originOf(loaded, used.name);
    return {
      name: used.name,
      from: used.from,
      origin,
      project: origin === 'kit' ? projectModule(loaded, used.name) : null,
      uses: used.uses,
    };
  });
  const byVar = new Map(loaded.tokens.map((token) => [cssVarName(token.path), token] as const));
  const tokens = tokenUsesOf([...tsx, ...scss]).flatMap((used) => {
    const token = byVar.get(used.var);
    if (token === undefined) return [];
    const path = token.path.join('.');
    return [
      {
        var: used.var,
        path,
        css: formatTokenValue(token),
        project: loaded.cssVarMap[path] ?? null,
        uses: used.uses,
      },
    ];
  });
  const shots = listed(deps, root, `${base}/build/shots`).flatMap((path) => {
    const match = SHOT.exec(path.slice(path.lastIndexOf('/') + 1));
    return match ? [{ state: match[1] ?? '', width: Number(match[2]), path }] : [];
  });

  const brief: CodeBrief = {
    schemaVersion: 1,
    slug,
    version,
    kind: own.kind,
    kit: draft.kit.id,
    draft: {
      layout: own.layout,
      sections: own.sections,
      data: listed(deps, root, `${base}/src/json`),
      images: listed(deps, root, `${base}/src/img`),
      shots,
    },
    components,
    tokens,
    write,
    target: `${dir}/target.json`,
    rules: deps.rules,
    report: `${dir}/fit.json`,
    decisions: handoffDecisions(deps.decisions()),
  };

  const facts = (deps.target ?? readTarget)({ files: deps.files }, { base: input.base });
  const beforeFile = `${base}/${CODE_FOLDER}/before.json`;
  const take = input.again === true || !deps.drafts.exists(slug, beforeFile);
  if (take) {
    const listing = (deps.listing ?? listProject)({ files: deps.files }, { base: input.base });
    deps.drafts.writeText(slug, beforeFile, serializeJson(listing));
  }
  deps.drafts.writeText(slug, `${base}/${CODE_FOLDER}/target.json`, serializeJson(facts));
  deps.drafts.writeText(slug, `${base}/${CODE_FOLDER}/brief.json`, serializeJson(brief));
  return { brief, dir, listed: take };
}
