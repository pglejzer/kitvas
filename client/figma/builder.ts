// The builder the hand-off's scripts call inside `use_figma` (plan 21, call 3), bundled into one
// plain script by `src/handoff/app/figma/bundle.ts`: a script is `const D=<data>;`, this bundle,
// then `return await B.<step>(figma, D)`. Each step finds its page, frames, sections and variables
// by name, never by an id, and is safe to run twice: what it made before, it finds and leaves as
// it is. The data types here are the contract with `src/handoff/domain/figma/scripts/`.
//
// Marks live in names only while a send runs, and `close` removes them: ` ⟨p2⟩` a section whose
// part 2 is next, ` ⟨a7⟩` a frame a later part continues in, ` ⟨b2⟩` a layer of part 2 while that
// part is being built (a run that stopped halfway is cleared by the next), ` ⟨i3⟩` image target 3.

import type {
  FigmaApi,
  FrameNode,
  PageNode,
  SceneNode,
  Variable,
  VariableCollection,
  VariableScope,
  VariableValue,
} from './api.ts';
import { buildLayer, type PackedLayer } from './build-layer.ts';
import { type Hex, rgba, type Scope, solid } from './build-text.ts';
import { loadFonts, type WantedFont } from './fonts.ts';

const MARK = / ⟨[abip]\d+⟩/;
const MARKS = / ⟨[abip]\d+⟩/g;
const WAITING = / ⟨p(\d+)⟩/;
const IMAGE = / ⟨i(\d+)⟩/;
/** Between a send's frames, and between them and what is on the page. */
const GAP = 200;

const mark = (id: string): string => ` ⟨${id}⟩`;
const strip = (name: string): string => name.replace(MARKS, '');

export type InspectData = { page: string; collection: string; families: string[] };
export type InspectResult = {
  pages: number;
  /** The id of the page the draft goes to, when the file has it already. */
  page: string | null;
  /** The kit's collection, when the file has it already. */
  collection: { id: string; variables: number } | null;
  /** Families Figma lacks; their text is set in Inter. */
  fontsMissing: string[];
};

/** A variable: name, type, value (a colour as `#rrggbbaa`), scopes, web code syntax. */
export type VariableData = {
  n: string;
  t: 'COLOR' | 'FLOAT' | 'STRING';
  v: string | number;
  s: VariableScope[];
  c: string;
};
export type VariablesData = { collection: string; variables: VariableData[] };
export type VariablesResult = {
  skipped: boolean;
  collection: string;
  /** The ids of the variables made. */
  created: string[];
  /** Variables the file had: kept as they are. */
  kept: number;
  /** Kept variables whose value or type is not the kit's. */
  differing: string[];
  /** Variables whose scopes Figma refused: they keep its default scopes. */
  refused: string[];
};

/** A section's frame: its layout id, its box in the width's frame, the number of its parts. */
export type SectionSpec = [string, [number, number, number, number], number];
export type FramesData = {
  page: string;
  /** Per width: the frame's name, width, height, background and sections. */
  frames: { n: string; w: number; h: number; c: Hex; s: SectionSpec[] }[];
};
export type FramesResult = {
  skipped: boolean;
  page: string;
  frames: { width: number; node: string }[];
  created: string[];
};

export type LayersData = {
  page: string;
  /** The width's frame, by its name during the send. */
  frame: string;
  collection: string;
  /** The section's layout id: its frame's name. */
  section: string;
  /** This script's part of the section, from 1, and the number of parts. */
  part: number;
  parts: number;
  /** The names of the variables the layers bind, by index. */
  vars: string[];
  /** The marks of frames earlier parts made that this part continues in. */
  continues: string[];
  layers: PackedLayer[];
};
export type LayersResult = {
  skipped: boolean;
  section: string;
  created: string[];
  /** Values left as they are: see `Scope.refused`. */
  refused: number;
  fontsMissing: string[];
};

export type TargetsData = { page: string; frames: string[]; count: number };
/** The image layers' ids in the order of the assets; null for one the file lacks. */
export type TargetsResult = { nodeIds: (string | null)[] };

/** Per width: the frame's name during the send, its name after, and the width. */
export type CloseData = { page: string; frames: [string, string, number][]; families: string[] };
export type CloseResult = {
  skipped: boolean;
  page: string | null;
  frames: { width: number; node: string }[];
  counts: { sections: number; layers: number; texts: number };
  /** Sections still waiting for a part: the send is partial. */
  unbuilt: string[];
  fontsMissing: string[];
};

const pageNamed = (figma: FigmaApi, name: string): PageNode | null =>
  figma.root.children.find((page) => page.name === name) ?? null;

function childFrame(parent: PageNode | FrameNode, test: (name: string) => boolean) {
  for (const child of parent.children) {
    if (child.type === 'FRAME' && test(child.name)) return child;
  }
  return null;
}

/** The page, switched to with the one switch a call may make; null when the file lacks it. */
async function openPage(figma: FigmaApi, name: string): Promise<PageNode | null> {
  const page = pageNamed(figma, name);
  if (page !== null) await figma.setCurrentPageAsync(page);
  return page;
}

async function missingFamilies(figma: FigmaApi, families: readonly string[]): Promise<string[]> {
  if (families.length === 0) return [];
  const listed = await figma.listAvailableFontsAsync();
  const have = new Set(listed.map((font) => font.fontName.family));
  return families.filter((family) => !have.has(family));
}

async function kitCollection(figma: FigmaApi, name: string): Promise<VariableCollection | null> {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  return all.find((collection) => collection.name === name) ?? null;
}

async function variablesOf(figma: FigmaApi, collection: VariableCollection) {
  const found = new Map<string, Variable>();
  for (const variable of await figma.variables.getLocalVariablesAsync()) {
    if (variable.variableCollectionId === collection.id) found.set(variable.name, variable);
  }
  return found;
}

/** Reads the file: its pages, the kit's collection, the families Figma lacks. Changes nothing. */
export async function inspect(figma: FigmaApi, data: InspectData): Promise<InspectResult> {
  const collection = await kitCollection(figma, data.collection);
  return {
    pages: figma.root.children.length,
    page: pageNamed(figma, data.page)?.id ?? null,
    collection:
      collection === null ? null : { id: collection.id, variables: collection.variableIds.length },
    fontsMissing: await missingFamilies(figma, data.families),
  };
}

const byte = (channel: number): string =>
  Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0');

function hexOf(value: VariableValue | undefined): string | null {
  if (typeof value !== 'object' || value === null || !('r' in value)) return null;
  const alpha = 'a' in value ? value.a : 1;
  return `#${byte(value.r)}${byte(value.g)}${byte(value.b)}${byte(alpha)}`;
}

function sameValue(variable: Variable, data: VariableData, mode: string): boolean {
  if (variable.resolvedType !== data.t) return false;
  const value = variable.valuesByMode[mode];
  if (typeof data.v === 'string' && data.t === 'COLOR') {
    return hexOf(value) === hexOf(rgba(data.v));
  }
  if (typeof value === 'number' && typeof data.v === 'number') {
    return Math.abs(value - data.v) < 1e-6;
  }
  return value === data.v;
}

/**
 * The kit's collection, `kitvas · <kit>` with the one mode `Default`, and the variables it lacks,
 * each with its value, scopes and web code syntax. A variable the file has is kept as it is; one
 * whose value is not the kit's is named in `differing`.
 */
export async function variables(figma: FigmaApi, data: VariablesData): Promise<VariablesResult> {
  const api = figma.variables;
  let collection = await kitCollection(figma, data.collection);
  const made = collection === null;
  if (collection === null) {
    collection = api.createVariableCollection(data.collection);
    const first = collection.modes[0];
    if (first !== undefined) collection.renameMode(first.modeId, 'Default');
  }
  const mode = collection.defaultModeId;
  const existing = await variablesOf(figma, collection);
  const created: string[] = [];
  const differing: string[] = [];
  const refused: string[] = [];
  let kept = 0;
  for (const each of data.variables) {
    const found = existing.get(each.n);
    if (found !== undefined) {
      kept += 1;
      if (!sameValue(found, each, mode)) differing.push(each.n);
      continue;
    }
    const variable = api.createVariable(each.n, collection, each.t);
    const value = each.t === 'COLOR' && typeof each.v === 'string' ? rgba(each.v) : each.v;
    variable.setValueForMode(mode, value);
    variable.setVariableCodeSyntax('WEB', each.c);
    try {
      variable.scopes = each.s;
    } catch (_refused) {
      refused.push(each.n);
    }
    existing.set(each.n, variable);
    created.push(variable.id);
  }
  const skipped = !made && created.length === 0;
  return { skipped, collection: collection.id, created, kept, differing, refused };
}

/**
 * The page `kitvas · <slug>` and, to the right of what is on it, a frame per width with a
 * placeholder frame per section at the section's box. What exists already is kept.
 */
export async function frames(figma: FigmaApi, data: FramesData): Promise<FramesResult> {
  const created: string[] = [];
  let page = pageNamed(figma, data.page);
  if (page === null) {
    page = figma.createPage();
    page.name = data.page;
    created.push(page.id);
  }
  await figma.setCurrentPageAsync(page);
  let right = Number.NEGATIVE_INFINITY;
  for (const node of page.children) right = Math.max(right, node.x + node.width);
  let x = right === Number.NEGATIVE_INFINITY ? 0 : right + GAP;
  const made: FramesResult['frames'] = [];
  for (const spec of data.frames) {
    let frame = childFrame(page, (name) => name === spec.n);
    if (frame === null) {
      frame = figma.createFrame();
      frame.name = spec.n;
      frame.resize(Math.max(1, spec.w), Math.max(1, spec.h));
      frame.fills = [solid(spec.c)];
      frame.clipsContent = true;
      frame.x = x;
      frame.y = 0;
      x += spec.w + GAP;
      created.push(frame.id);
    }
    for (const [id, [left, top, width, height], parts] of spec.s) {
      if (childFrame(frame, (name) => strip(name) === id) !== null) continue;
      const section = figma.createFrame();
      section.name = parts > 0 ? `${id}${mark('p1')}` : id;
      section.fills = [];
      section.clipsContent = false;
      frame.appendChild(section);
      section.resize(Math.max(0.01, width), Math.max(0.01, height));
      section.x = left;
      section.y = top;
      if (parts > 0) section.placeholder = true;
      created.push(section.id);
    }
    made.push({ width: spec.w, node: frame.id });
  }
  return { skipped: created.length === 0, page: page.id, frames: made, created };
}

/** The fonts the layers write: each text's own and each of its runs'. */
function fontsOf(layers: readonly PackedLayer[]): WantedFont[] {
  const wanted: WantedFont[] = [];
  for (const { t } of layers) {
    if (t === undefined) continue;
    wanted.push({ family: t.f, weight: t.w, italic: t.i === 1 });
    for (const [, , weight, italic] of t.r ?? []) {
      wanted.push({ family: t.f, weight, italic: italic === 1 });
    }
  }
  return wanted;
}

function markedFrame(section: FrameNode, id: string): FrameNode {
  const found = section.findOne((node) => node.type === 'FRAME' && node.name.includes(mark(id)));
  if (found === null || found.type !== 'FRAME') {
    const where = strip(section.name);
    throw new Error(`No frame marked ${id} in section "${where}": run its earlier part first`);
  }
  return found;
}

/**
 * One part of one section: the layers, in order, each into its parent. A section that is built,
 * or whose later part is next, is skipped; one whose earlier part has not run is refused.
 */
export async function layers(figma: FigmaApi, data: LayersData): Promise<LayersResult> {
  const page = await openPage(figma, data.page);
  const frame = page === null ? null : childFrame(page, (name) => name === data.frame);
  const ours = (name: string): boolean => strip(name) === data.section;
  const section = frame === null ? null : childFrame(frame, ours);
  if (section === null) {
    throw new Error(`No frame for section "${data.section}": run 20-frames.js first`);
  }
  const waiting = WAITING.exec(section.name);
  const next = waiting === null ? null : Number(waiting[1]);
  if (next === null || next > data.part) {
    return { skipped: true, section: section.id, created: [], refused: 0, fontsMissing: [] };
  }
  if (next < data.part) {
    throw new Error(`Part ${next} of section "${data.section}" has not run yet`);
  }
  const building = mark(`b${data.part}`);
  for (const node of section.findAll((each) => each.name.includes(building))) {
    if (!node.removed) node.remove();
  }
  const fonts = await loadFonts(figma, fontsOf(data.layers));
  const collection = data.vars.length === 0 ? null : await kitCollection(figma, data.collection);
  const found =
    collection === null ? new Map<string, Variable>() : await variablesOf(figma, collection);
  const scope: Scope = {
    figma,
    fonts,
    vars: data.vars.map((name) => found.get(name) ?? null),
    mode: collection?.defaultModeId ?? '',
    refused: 0,
  };
  const continued = data.continues.map((id) => markedFrame(section, id));
  const holders: FrameNode[] = [];
  const roots: { node: SceneNode; name: string }[] = [];
  const created: string[] = [];
  for (const layer of data.layers) {
    const parent =
      layer.p >= 0 ? holders[layer.p] : layer.p === -1 ? section : continued[-layer.p - 2];
    let name = layer.n;
    if (layer.m !== undefined) name += mark(layer.m);
    if (layer.i !== undefined) name += mark(`i${layer.i}`);
    const root = layer.p < 0;
    const built = buildLayer(scope, layer, parent ?? section, root ? name + building : name);
    if (root) roots.push({ node: built.node, name });
    holders.push(built.holder);
    created.push(...built.ids);
  }
  for (const root of roots) root.node.name = root.name;
  const last = data.part >= data.parts;
  section.name = last ? data.section : `${data.section}${mark(`p${data.part + 1}`)}`;
  if (last) section.placeholder = false;
  return {
    skipped: false,
    section: section.id,
    created,
    refused: scope.refused,
    fontsMissing: fonts.missing,
  };
}

/** Reads the ids of the image layers, in the order of the assets. Changes nothing. */
export async function targets(figma: FigmaApi, data: TargetsData): Promise<TargetsResult> {
  const nodeIds: (string | null)[] = [];
  for (let at = 0; at < data.count; at += 1) nodeIds.push(null);
  const page = await openPage(figma, data.page);
  if (page === null) return { nodeIds };
  for (const name of data.frames) {
    const frame = childFrame(page, (each) => each === name);
    for (const node of frame?.findAll((each) => IMAGE.test(each.name)) ?? []) {
      const at = Number(IMAGE.exec(node.name)?.[1]);
      if (at < data.count && nodeIds[at] === null) nodeIds[at] = node.id;
    }
  }
  return { nodeIds };
}

/**
 * Ends the send: no mark left in a name, no placeholder shimmer, the send id gone from the frames'
 * names (last, so a close that stops halfway runs again). Returns the frames and the counts.
 */
export async function close(figma: FigmaApi, data: CloseData): Promise<CloseResult> {
  const result: CloseResult = {
    skipped: true,
    page: null,
    frames: [],
    counts: { sections: 0, layers: 0, texts: 0 },
    unbuilt: [],
    fontsMissing: [],
  };
  const page = await openPage(figma, data.page);
  if (page === null) return result;
  result.page = page.id;
  const found: { frame: FrameNode; final: string; width: number }[] = [];
  for (const [name, final, width] of data.frames) {
    const frame = childFrame(page, (each) => each === name);
    if (frame !== null) found.push({ frame, final, width });
  }
  if (found.length === 0) return result;
  for (const { frame } of found) {
    for (const section of frame.children) {
      if (section.type !== 'FRAME') continue;
      result.counts.sections += 1;
      if (WAITING.test(section.name)) result.unbuilt.push(strip(section.name));
      section.placeholder = false;
    }
    const all = frame.findAll();
    for (const node of all) if (MARK.test(node.name)) node.name = strip(node.name);
    result.counts.layers += all.length - frame.children.length;
    result.counts.texts += all.filter((node) => node.type === 'TEXT').length;
  }
  for (const { frame, final, width } of found) {
    frame.name = final;
    result.frames.push({ width, node: frame.id });
  }
  result.skipped = false;
  result.fontsMissing = await missingFamilies(figma, data.families);
  return result;
}
