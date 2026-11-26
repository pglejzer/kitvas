// Rules: ui-look (hierarchy, colour, media, the wireframe look).

import type { RawFinding } from '../findings/finding.ts';
import {
  UI_FLAT_HIERARCHY,
  UI_HUE_COUNT,
  UI_IMAGE_DISTORTED,
  UI_MANY_LARGE,
  UI_PLACEHOLDER_MEDIA,
  UI_WIREFRAME,
} from '../guidelines/ui-look.ts';
import type { PageFacts } from '../page/facts.ts';
import { hueBucket, isNeutral, parseColour } from './colour.ts';
import { MEDIA_TAGS, subtreeHas, textNodes } from './geometry.ts';
import type { VisitInput, VisitRule } from './types.ts';
import {
  kitComponentOf,
  PLACEHOLDER_FIX,
  PLACEHOLDER_REVIEW,
  ruleFinding,
  sectionKey,
} from './types.ts';

function report(
  input: VisitInput,
  guideline: { id: string; key: string },
  node: number | null,
  messageParams: Record<string, string | number> = {},
  hintParams: Record<string, string | number> = {},
): RawFinding {
  return ruleFinding(input, {
    rule: guideline.id,
    severity: 'review',
    node,
    message: { key: `checkRule.${guideline.key}`, params: messageParams },
    hint: { key: `checkHint.${guideline.key}`, params: hintParams },
  });
}

/** Text blocks where one (rounded size, weight) pair holds most of the characters. */
function isFlat(facts: PageFacts): boolean {
  const { minBlocks, maxShare } = UI_FLAT_HIERARCHY.thresholds;
  const blocks = textNodes(facts);
  if (blocks.length < minBlocks) return false;
  const pairs = new Map<string, number>();
  let total = 0;
  for (const index of blocks) {
    const node = facts.nodes[index];
    if (!node?.text) continue;
    const key = `${Math.round(node.style.fontSize)}/${node.style.fontWeight}`;
    pairs.set(key, (pairs.get(key) ?? 0) + node.text.chars);
    total += node.text.chars;
  }
  return total > 0 && Math.max(...pairs.values()) / total > maxShare;
}

/**
 * Boxes with a flat neutral fill and nothing in them: text, image, svg, video, picture or canvas.
 * A box that paints a background image is a picture too: a draft shows its images that way.
 */
function placeholderBoxes(facts: PageFacts): number[] {
  const t = UI_PLACEHOLDER_MEDIA.thresholds;
  const hasText = subtreeHas(facts, (node) => node.text !== null);
  const hasMedia = subtreeHas(
    facts,
    (node) => MEDIA_TAGS.has(node.tag) || node.image !== null || node.style.backgroundImage,
  );
  const found: number[] = [];
  facts.nodes.forEach((node, index) => {
    if (node.hidden || hasText[index] || hasMedia[index]) return;
    const fill = parseColour(node.style.background);
    if (!fill || fill.a <= 0 || !isNeutral(node.style.background)) return;
    const [, , width, height] = node.box;
    if (width < t.minWidth || height < t.minHeight) return;
    const ratio = width / height;
    if (ratio < t.minRatio || ratio > t.maxRatio) return;
    found.push(index);
  });
  const bars = barsOf(facts, found);
  return found.filter((index) => !bars.has(index));
}

/**
 * The boxes of a chart's bars: `barRun` or more candidates of one parent that share an edge (the
 * bottoms or the lefts within `barTolerance`) and differ along it (heights or widths apart by more
 * than the tolerance). A chart's bars are data, not pictures to come.
 */
function barsOf(facts: PageFacts, candidates: readonly number[]): Set<number> {
  const { barRun, barTolerance } = UI_PLACEHOLDER_MEDIA.thresholds;
  const byParent = new Map<number, number[]>();
  for (const index of candidates) {
    const parent = facts.nodes[index]?.parent ?? -1;
    byParent.set(parent, [...(byParent.get(parent) ?? []), index]);
  }
  const bars = new Set<number>();
  const boxOf = (index: number) => facts.nodes[index]?.box ?? [0, 0, 0, 0];
  for (const members of byParent.values()) {
    if (members.length < barRun) continue;
    // `edge` reads the shared edge, `size` the measure along it.
    const axes = [
      { edge: (i: number) => boxOf(i)[1] + boxOf(i)[3], size: (i: number) => boxOf(i)[3] },
      { edge: (i: number) => boxOf(i)[0], size: (i: number) => boxOf(i)[2] },
    ];
    for (const { edge, size } of axes) {
      for (const member of members) {
        const run = members.filter((other) => Math.abs(edge(other) - edge(member)) <= barTolerance);
        const sizes = run.map(size);
        if (run.length >= barRun && Math.max(...sizes) - Math.min(...sizes) > barTolerance) {
          bars.add(member);
        }
      }
    }
  }
  return bars;
}

/** All visible text blocks share one font weight. */
function isSingleWeight(facts: PageFacts): boolean {
  const blocks = textNodes(facts);
  if (blocks.length < UI_WIREFRAME.thresholds.minBlocks) return false;
  const weights = new Set(blocks.map((index) => facts.nodes[index]?.style.fontWeight));
  return weights.size === 1;
}

function hasPlaceholderCopy(facts: PageFacts): boolean {
  return facts.nodes.some((node) => {
    if (node.hidden) return false;
    const samples = [node.text?.sample, node.action?.text];
    return samples.some(
      (sample) =>
        sample !== undefined &&
        (PLACEHOLDER_FIX.test(sample) || PLACEHOLDER_REVIEW.test(sample.trim())),
    );
  });
}

const manyLarge: VisitRule = {
  id: UI_MANY_LARGE.id,
  run(input) {
    const { facts } = input;
    const { largeFactor, maxLarge } = UI_MANY_LARGE.thresholds;
    const counts = new Map<string, number>();
    const found: RawFinding[] = [];
    for (const index of textNodes(facts)) {
      const node = facts.nodes[index];
      if (!node || node.box[1] >= facts.viewport[1]) continue;
      if (node.style.fontSize < largeFactor * facts.bodyFontSize) continue;
      const section = sectionKey(node.ks);
      if (section === null) continue;
      const count = (counts.get(section) ?? 0) + 1;
      counts.set(section, count);
      if (count === maxLarge + 1) found.push(report(input, UI_MANY_LARGE, index));
    }
    return found;
  },
};

const flatHierarchy: VisitRule = {
  id: UI_FLAT_HIERARCHY.id,
  run(input) {
    return isFlat(input.facts) ? [report(input, UI_FLAT_HIERARCHY, null)] : [];
  },
};

const hueCount: VisitRule = {
  id: UI_HUE_COUNT.id,
  run(input) {
    const hues = new Set<number>();
    input.facts.nodes.forEach((node, index) => {
      if (node.hidden || kitComponentOf(input, index) !== null) return;
      if (node.text !== null) {
        const ink = hueBucket(node.style.color);
        if (ink !== null) hues.add(ink);
      }
      const fill = parseColour(node.style.background);
      const surface = fill && fill.a > 0 ? hueBucket(node.style.background) : null;
      if (surface !== null) hues.add(surface);
    });
    if (hues.size <= UI_HUE_COUNT.thresholds.maxHues) return [];
    return [report(input, UI_HUE_COUNT, null, {}, { count: hues.size })];
  },
};

const imageDistorted: VisitRule = {
  id: UI_IMAGE_DISTORTED.id,
  run(input) {
    const found: RawFinding[] = [];
    input.facts.nodes.forEach((node, index) => {
      if (node.hidden || !node.image || node.style.objectFit !== 'fill') return;
      const [naturalWidth, naturalHeight] = node.image.natural;
      const [, , width, height] = node.box;
      if (naturalWidth <= 0 || naturalHeight <= 0 || width <= 0 || height <= 0) return;
      const drift = Math.abs(width / height / (naturalWidth / naturalHeight) - 1);
      if (drift <= UI_IMAGE_DISTORTED.thresholds.maxDrift) return;
      found.push(
        report(input, UI_IMAGE_DISTORTED, index, {}, { percent: Math.round(drift * 100) }),
      );
    });
    return found;
  },
};

const placeholderMedia: VisitRule = {
  id: UI_PLACEHOLDER_MEDIA.id,
  run(input) {
    const boxes = placeholderBoxes(input.facts);
    const { minBoxes, maxReported } = UI_PLACEHOLDER_MEDIA.thresholds;
    if (boxes.length < minBoxes) return [];
    return boxes.slice(0, maxReported).map((index) => report(input, UI_PLACEHOLDER_MEDIA, index));
  },
};

/** The signals a wireframe shows; their ids go into the message params as data, not text. */
type Signal = 'media' | 'copy' | 'hierarchy' | 'weight';

const wireframe: VisitRule = {
  id: UI_WIREFRAME.id,
  run(input) {
    const { facts } = input;
    const signals: Signal[] = [];
    if (placeholderBoxes(facts).length >= UI_PLACEHOLDER_MEDIA.thresholds.minBoxes) {
      signals.push('media');
    }
    if (hasPlaceholderCopy(facts)) signals.push('copy');
    if (isFlat(facts)) signals.push('hierarchy');
    if (isSingleWeight(facts)) signals.push('weight');
    if (signals.length < UI_WIREFRAME.thresholds.minSignals) return [];
    return [report(input, UI_WIREFRAME, null, { signals: signals.join(',') })];
  },
};

export const UI_LOOK_RULES: VisitRule[] = [
  manyLarge,
  flatHierarchy,
  hueCount,
  imageDistorted,
  placeholderMedia,
  wireframe,
];
