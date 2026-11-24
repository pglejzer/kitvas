// Rules: ui-type. Typography of the text blocks a visit measured. All of them are `review`.

import type { RawFinding } from '../findings/finding.ts';
import {
  UI_CENTERED_TEXT,
  UI_HEADING_LINE_HEIGHT,
  UI_HEADING_SCALE,
  UI_JUSTIFIED_TEXT,
  UI_LINE_HEIGHT,
  UI_LINE_LENGTH,
  UI_TEXT_SIZE,
  UI_TYPE_SIZES,
  UI_TYPE_WEIGHTS,
} from '../guidelines/ui-type.ts';
import type { FactNode, PageFacts, TextFacts } from '../page/facts.ts';
import type { VisitInput, VisitRule } from './types.ts';
import { ruleFinding } from './types.ts';

type Item = { index: number; node: FactNode; text: TextFacts };
type Hit = { node: number | null; hint?: Record<string, string | number> };

function textItems(facts: PageFacts): Item[] {
  const items: Item[] = [];
  facts.nodes.forEach((node, index) => {
    if (node.text !== null && !node.hidden) items.push({ index, node, text: node.text });
  });
  return items;
}

function isHeading(item: Item, facts: PageFacts): boolean {
  return (
    item.node.heading > 0 ||
    item.node.style.fontSize >= UI_HEADING_SCALE.thresholds.headingFactor * facts.bodyFontSize
  );
}

function bodyItems(facts: PageFacts): Item[] {
  return textItems(facts).filter((item) => !isHeading(item, facts));
}

function ratioOf(item: Item): number {
  return item.node.style.lineHeight / item.node.style.fontSize;
}

function makeRule(
  entry: { id: string; key: string },
  hits: (input: VisitInput) => Hit[],
): VisitRule {
  return {
    id: entry.id,
    run(input: VisitInput): RawFinding[] {
      return hits(input).map((hit) =>
        ruleFinding(input, {
          rule: entry.id,
          severity: 'review',
          node: hit.node,
          message: { key: `checkRule.${entry.key}`, params: {} },
          hint: { key: `checkHint.${entry.key}`, params: hit.hint ?? {} },
          // The draft chooses the alignment, also of a kit's text component.
          kit: entry.id === UI_CENTERED_TEXT.id ? 'keep' : 'review',
        }),
      );
    },
  };
}

/** Characters per font size (rounded) over these items. */
function charsBySize(items: Item[]): Map<number, number> {
  const sizes = new Map<number, number>();
  for (const item of items) {
    const size = Math.round(item.node.style.fontSize);
    sizes.set(size, (sizes.get(size) ?? 0) + item.text.chars);
  }
  return sizes;
}

/** Keys of a map whose value is at least `share` of the total. */
function significant(counts: Map<number, number>, share: number): number[] {
  let total = 0;
  for (const value of counts.values()) total += value;
  if (total === 0) return [];
  return [...counts.entries()]
    .filter(([, value]) => value / total >= share)
    .map(([key]) => key)
    .sort((a, b) => a - b);
}

const lineLength = makeRule(UI_LINE_LENGTH, (input) =>
  bodyItems(input.facts)
    .filter(
      (item) =>
        item.text.lines >= UI_LINE_LENGTH.thresholds.minLines &&
        item.text.longest > UI_LINE_LENGTH.thresholds.maxChars,
    )
    .map((item) => ({ node: item.index, hint: { longest: Math.round(item.text.longest) } })),
);

const lineHeight = makeRule(UI_LINE_HEIGHT, (input) =>
  bodyItems(input.facts)
    .filter(
      (item) =>
        item.text.lines >= UI_LINE_HEIGHT.thresholds.minLines &&
        (ratioOf(item) < UI_LINE_HEIGHT.thresholds.min ||
          ratioOf(item) > UI_LINE_HEIGHT.thresholds.max),
    )
    .map((item) => ({ node: item.index, hint: { ratio: ratioOf(item).toFixed(2) } })),
);

const headingLineHeight = makeRule(UI_HEADING_LINE_HEIGHT, (input) =>
  textItems(input.facts)
    .filter(
      (item) =>
        isHeading(item, input.facts) &&
        item.text.lines >= UI_HEADING_LINE_HEIGHT.thresholds.minLines &&
        (ratioOf(item) > UI_HEADING_LINE_HEIGHT.thresholds.max ||
          ratioOf(item) < UI_HEADING_LINE_HEIGHT.thresholds.min),
    )
    .map((item) => ({ node: item.index, hint: { ratio: ratioOf(item).toFixed(2) } })),
);

const textSize = makeRule(UI_TEXT_SIZE, (input) => {
  if (input.seen.width !== UI_TEXT_SIZE.thresholds.width) return [];
  return textItems(input.facts)
    .filter((item) => {
      const size = item.node.style.fontSize;
      if (size < UI_TEXT_SIZE.thresholds.anyMin) return true;
      return (
        !isHeading(item, input.facts) &&
        item.text.lines >= UI_TEXT_SIZE.thresholds.minLines &&
        size < UI_TEXT_SIZE.thresholds.bodyMin
      );
    })
    .map((item) => ({ node: item.index, hint: { size: item.node.style.fontSize } }));
});

const typeSizes = makeRule(UI_TYPE_SIZES, (input) => {
  const sizes = significant(charsBySize(textItems(input.facts)), UI_TYPE_SIZES.thresholds.share);
  if (sizes.length <= UI_TYPE_SIZES.thresholds.maxSizes) return [];
  return [{ node: null, hint: { count: sizes.length, sizes: sizes.join(', ') } }];
});

const typeWeights = makeRule(UI_TYPE_WEIGHTS, (input) => {
  const items = textItems(input.facts);
  const step = UI_TYPE_WEIGHTS.thresholds.step;
  const counts = new Map<number, number>();
  for (const item of items) {
    const weight = Math.round(item.node.style.fontWeight / step) * step;
    counts.set(weight, (counts.get(weight) ?? 0) + item.text.chars);
  }
  const weights = significant(counts, UI_TYPE_WEIGHTS.thresholds.share);
  const tooMany = weights.length > UI_TYPE_WEIGHTS.thresholds.maxWeights;
  const flat = weights.length === 1 && items.length >= UI_TYPE_WEIGHTS.thresholds.minTextNodes;
  if (!tooMany && !flat) return [];
  return [{ node: null, hint: { count: weights.length, weights: weights.join(', ') } }];
});

/** The most common font size by characters among body text; the page's body size without any. */
function bodySize(facts: PageFacts): number {
  let best = facts.bodyFontSize;
  let most = 0;
  for (const [size, chars] of charsBySize(bodyItems(facts))) {
    if (chars > most) {
      best = size;
      most = chars;
    }
  }
  return best;
}

const headingScale = makeRule(UI_HEADING_SCALE, (input) => {
  const { facts } = input;
  const found = new Map<number, number>();
  for (const item of textItems(facts)) {
    if (!isHeading(item, facts)) continue;
    const size = Math.round(item.node.style.fontSize);
    if (!found.has(size)) found.set(size, item.index);
  }
  const sizes = [...found.keys()].sort((a, b) => b - a);
  const body = bodySize(facts);
  const hits: Hit[] = [];
  for (let at = 1; at < sizes.length; at++) {
    const larger = sizes[at - 1] ?? 0;
    const smaller = sizes[at] ?? 0;
    if (smaller > 0 && larger / smaller < UI_HEADING_SCALE.thresholds.minStep) {
      hits.push({
        node: found.get(smaller) ?? null,
        hint: { size: smaller, ratio: (larger / smaller).toFixed(2), body },
      });
    }
  }
  const top = sizes[0];
  if (top !== undefined && body > 0 && top / body < UI_HEADING_SCALE.thresholds.topFactor) {
    hits.push({
      node: found.get(top) ?? null,
      hint: { size: top, ratio: (top / body).toFixed(2), body },
    });
  }
  return hits;
});

const centeredText = makeRule(UI_CENTERED_TEXT, (input) =>
  bodyItems(input.facts)
    .filter(
      (item) =>
        item.text.lines >= UI_CENTERED_TEXT.thresholds.minLines &&
        item.node.style.textAlign === 'center',
    )
    .map((item) => ({ node: item.index })),
);

const justifiedText = makeRule(UI_JUSTIFIED_TEXT, (input) =>
  textItems(input.facts)
    .filter(
      (item) =>
        item.text.lines >= UI_JUSTIFIED_TEXT.thresholds.minLines &&
        item.node.style.textAlign === 'justify',
    )
    .map((item) => ({ node: item.index })),
);

export const UI_TYPE_RULES: VisitRule[] = [
  lineLength,
  lineHeight,
  headingLineHeight,
  textSize,
  typeSizes,
  typeWeights,
  headingScale,
  centeredText,
  justifiedText,
];
