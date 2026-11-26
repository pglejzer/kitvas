// The scripts of a send to Figma (plan 21, goals A5 and A7). Each is `const D=<data>;`, the bundled
// builder, then the call of its step, and the skill passes it to `use_figma` unchanged. None is
// longer than the limit: the kit's variables and a large section go over several scripts. The
// files sort in the order they run: 00 inspect, 10 variables, 20 frames, 30 layers per width,
// 40 image targets, 50 close. Pure.

import type { LayersData, VariableData } from '../../../../../client/figma/builder.ts';
import { KitvasError } from '../../../../shared/index.ts';
import type { FigmaStep } from '../manifest.ts';
import type { HandoffTree, TreeSection } from '../tree.ts';
import type { FigmaVariable } from '../variables.ts';
import { isImageTarget, literal, packedSection, packVariable } from './pack.ts';
import { continuedIn, ownLayers, splitSection } from './split.ts';
import {
  closeData,
  FIGMA_TARGETS_FILE,
  figmaCollectionName,
  figmaFrameName,
  figmaPageName,
  figmaSteps,
  framesData,
  imageItems,
  inspectData,
  layersDescription,
  STEP_DESCRIPTIONS,
  targetsData,
} from './steps.ts';

/** The name the builder's exports have inside a script: the bundle's `var B=…`. */
export const FIGMA_BUILDER_GLOBAL = 'B';
/** A script's longest length by default; `use_figma` takes 50,000 characters. */
export const FIGMA_SCRIPT_LIMIT = 45_000;

/** `file`: the script's name in the package's `scripts/`. */
export type FigmaScript = { file: string; description: string; writes: boolean; code: string };

type Step = 'inspect' | 'variables' | 'frames' | 'layers' | 'targets' | 'close';

/** One script: the data as a literal, the builder, and the call of its step. */
export function scriptCode(builder: string, step: Step, data: string): string {
  return `const D=${data};\n${builder}\nreturn await ${FIGMA_BUILDER_GLOBAL}.${step}(figma, D);`;
}

const tooLong = (what: string, limit: number): KitvasError =>
  new KitvasError('INTERNAL', {
    detail: `${what} does not fit in a script of ${limit} characters`,
  });

/** A number padded so that the names sort: `01` … `12`, or `001` past 99. */
const padded = (number: number, count: number): string =>
  String(number).padStart(Math.max(2, String(count).length), '0');

/** The kit's variables in as few scripts as fit; a name met twice is sent once. */
function variableChunks(
  builder: string,
  collection: string,
  variables: readonly FigmaVariable[],
  limit: number,
): VariableData[][] {
  const seen = new Set<string>();
  const packed = variables.map(packVariable).filter((variable) => {
    if (seen.has(variable.n)) return false;
    seen.add(variable.n);
    return true;
  });
  const empty = scriptCode(builder, 'variables', literal({ collection, variables: [] }));
  const room = limit - empty.length;
  const chunks: VariableData[][] = [];
  let chunk: VariableData[] = [];
  let used = 0;
  for (const variable of packed) {
    const size = literal(variable).length + 1;
    if (size > room) throw tooLong(`variable "${variable.n}"`, limit);
    if (chunk.length > 0 && used + size > room) {
      chunks.push(chunk);
      chunk = [];
      used = 0;
    }
    chunk.push(variable);
    used += size;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

/**
 * The layers scripts of one section at one width: one when it fits, else its parts in order. The
 * split is measured, then checked; a part still too long is split again with less room.
 */
function sectionScripts(
  builder: string,
  head: LayersData,
  section: TreeSection,
  firstImage: number,
  limit: number,
): { code: string; data: LayersData }[] {
  const codeOf = (data: LayersData): string => scriptCode(builder, 'layers', literal(data));
  // Room for the part numbers, up to three digits each.
  let room = limit - codeOf(head).length - 8;
  for (let attempt = 0; attempt < 6 && room > 0; attempt += 1) {
    const parts = splitSection(section, room);
    const continued = continuedIn(parts);
    let offset = 0;
    let image = firstImage;
    const scripts = parts.map((part, at) => {
      const packed = packedSection(part, { offset, continued, firstImage: image });
      const own = ownLayers(part);
      offset += own.length;
      image += own.filter((layer) => isImageTarget(layer)).length;
      const data: LayersData = { ...head, part: at + 1, parts: parts.length, ...packed };
      return { code: codeOf(data), data };
    });
    const longest = Math.max(...scripts.map((script) => script.code.length));
    if (longest <= limit) return scripts;
    room -= longest - limit + 512;
  }
  throw tooLong(`section "${section.id}" at ${head.frame}`, limit);
}

/**
 * Every script of a send and the manifest's steps. `builder` is `bundleFigmaBuilder`'s text;
 * `limit` the longest a script may be. A script that cannot be made short enough (a builder
 * nearly as long as the limit) is kitvas's own fault: INTERNAL.
 */
export function figmaScripts(
  tree: HandoffTree,
  variables: readonly FigmaVariable[],
  builder: string,
  options: { limit: number },
): { scripts: FigmaScript[]; steps: FigmaStep[] } {
  const { limit } = options;
  const page = figmaPageName(tree.slug);
  const collection = figmaCollectionName(tree.kit);
  const scripts: FigmaScript[] = [];
  const add = (file: string, step: Step, data: unknown, description: string, writes: boolean) => {
    const code = scriptCode(builder, step, literal(data));
    if (code.length > limit) throw tooLong(file, limit);
    scripts.push({ file, description, writes, code });
  };

  add('00-inspect.js', 'inspect', inspectData(tree), STEP_DESCRIPTIONS.inspect, false);
  const chunks = variableChunks(builder, collection, variables, limit);
  chunks.forEach((chunk, at) => {
    const file =
      chunks.length === 1 ? '10-variables.js' : `10-variables-${padded(at + 1, chunks.length)}.js`;
    add(file, 'variables', { collection, variables: chunk }, STEP_DESCRIPTIONS.variables, true);
  });

  const parts: number[][] = [];
  const layers: FigmaScript[] = [];
  let image = 0;
  for (const frame of tree.frames) {
    const counts: number[] = [];
    const made: { code: string; data: LayersData }[] = [];
    for (const section of frame.sections) {
      const head: LayersData = {
        page,
        frame: figmaFrameName(tree, frame.width),
        collection,
        section: section.id,
        part: 1,
        parts: 1,
        vars: [],
        continues: [],
        layers: [],
      };
      const own =
        section.layers.length === 0 ? [] : sectionScripts(builder, head, section, image, limit);
      counts.push(own.length);
      made.push(...own);
      image += section.layers.filter((layer) => isImageTarget(layer)).length;
    }
    parts.push(counts);
    made.forEach(({ code, data }, at) => {
      const description = layersDescription(data.section, frame.width, data.part, data.parts);
      const file = `30-${frame.width}-${padded(at + 1, made.length)}.js`;
      layers.push({ file, description, writes: true, code });
    });
  }
  add('20-frames.js', 'frames', framesData(tree, parts), STEP_DESCRIPTIONS.frames, true);
  scripts.push(...layers);

  const items = imageItems(tree);
  if (items.length > 0) {
    const data = targetsData(tree, items.length);
    add(FIGMA_TARGETS_FILE, 'targets', data, STEP_DESCRIPTIONS.targets, false);
  }
  add('50-close.js', 'close', closeData(tree), STEP_DESCRIPTIONS.close, true);
  return { scripts, steps: figmaSteps(scripts, items) };
}
