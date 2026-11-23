// Rules: ui-layout (page edges, spacing, cards, chrome).

import type { RawFinding } from '../finding.ts';
import {
  UI_CARD_SIZES,
  UI_CLIPPED_TEXT,
  UI_EDGE_GAP,
  UI_HEADING_GAP,
  UI_NESTED_FRAME,
  UI_ORPHAN_CARD,
  UI_PAGE_OVERFLOW,
  UI_SHADOW_COUNT,
  UI_STICKY_CHROME,
  UI_STRAY_EDGE,
  UI_TRIPLE_FRAME,
} from '../guidelines/ui-layout.ts';
import {
  ancestorsOf,
  childrenOf,
  cuesOf,
  frameOf,
  frameRows,
  subtreeHas,
  textNodes,
} from './geometry.ts';
import type { VisitInput, VisitRule } from './types.ts';
import { ruleFinding } from './types.ts';

const msg = (key: string, params: Record<string, string | number> = {}) => ({ key, params });

/**
 * Rules about where the draft puts things (gaps, edges, rows, nesting). The draft decides the
 * place even of a kit component, so a finding inside one stays the draft's to fix.
 */
const PLACED_BY_DRAFT: ReadonlySet<string> = new Set([
  UI_PAGE_OVERFLOW.id,
  UI_HEADING_GAP.id,
  UI_EDGE_GAP.id,
  UI_STRAY_EDGE.id,
  UI_CARD_SIZES.id,
  UI_ORPHAN_CARD.id,
  UI_NESTED_FRAME.id,
]);

function at(
  input: VisitInput,
  rule: string,
  node: number | null,
  key: string,
  messageParams: Record<string, string | number>,
  hintParams: Record<string, string | number>,
  severity: 'fix' | 'review' = 'review',
): RawFinding {
  return ruleFinding(input, {
    rule,
    severity,
    node,
    message: msg(`checkRule.${key}`, messageParams),
    hint: msg(`checkHint.${key}`, hintParams),
    kit: PLACED_BY_DRAFT.has(rule) ? 'keep' : 'review',
  });
}

const pageOverflow: VisitRule = {
  id: UI_PAGE_OVERFLOW.id,
  run(input) {
    const { facts } = input;
    const { tolerance, maxReported } = UI_PAGE_OVERFLOW.thresholds;
    const width = facts.viewport[0];
    if (facts.scrollWidth <= width + tolerance) return [];
    const right = (index: number): number => {
      const box = facts.nodes[index]?.box ?? [0, 0, 0, 0];
      return box[0] + box[2];
    };
    const past = new Set<number>();
    facts.nodes.forEach((node, index) => {
      if (node.hidden || right(index) <= width + tolerance) return;
      const chain = [index, ...ancestorsOf(facts, index)];
      const exempt = chain.some((position) => {
        const own = facts.nodes[position];
        if (!own) return false;
        if (own.style.position === 'fixed') return true;
        return position !== index && ['auto', 'scroll'].includes(own.style.overflowX);
      });
      if (!exempt) past.add(index);
    });
    // Where the overflow starts: a node past the edge whose parent still fits. Its children are
    // past the edge only because it is, so reporting them would blame the wrong element.
    const starts = [...past].filter((index) => !past.has(facts.nodes[index]?.parent ?? -1));
    if (starts.length === 0) {
      return [
        at(
          input,
          UI_PAGE_OVERFLOW.id,
          null,
          UI_PAGE_OVERFLOW.key,
          { tag: 'html' },
          { over: Math.round(facts.scrollWidth - width) },
          'fix',
        ),
      ];
    }
    return starts
      .slice(0, maxReported)
      .map((index) =>
        at(
          input,
          UI_PAGE_OVERFLOW.id,
          index,
          UI_PAGE_OVERFLOW.key,
          { tag: facts.nodes[index]?.tag ?? '' },
          { over: Math.round(right(index) - width) },
          'fix',
        ),
      );
  },
};

const clippedText: VisitRule = {
  id: UI_CLIPPED_TEXT.id,
  run(input) {
    const { facts } = input;
    const { tolerance } = UI_CLIPPED_TEXT.thresholds;
    const hasText = subtreeHas(facts, (node) => node.text !== null);
    const softened = subtreeHas(
      facts,
      (node) => node.style.textOverflow === 'ellipsis' || node.style.lineClamp > 0,
    );
    const found: RawFinding[] = [];
    facts.nodes.forEach((node, index) => {
      if (node.hidden || node.scroll === null || !hasText[index]) return;
      const [scrollWidth, clientWidth, scrollHeight, clientHeight] = node.scroll;
      if (scrollWidth <= clientWidth + tolerance && scrollHeight <= clientHeight + tolerance)
        return;
      found.push(
        at(
          input,
          UI_CLIPPED_TEXT.id,
          index,
          UI_CLIPPED_TEXT.key,
          { tag: node.tag },
          {},
          softened[index] ? 'review' : 'fix',
        ),
      );
    });
    return found;
  },
};

const headingGap: VisitRule = {
  id: UI_HEADING_GAP.id,
  run(input) {
    const { facts } = input;
    const { ratio } = UI_HEADING_GAP.thresholds;
    const kids = childrenOf(facts);
    const found: RawFinding[] = [];
    facts.nodes.forEach((node, index) => {
      if (node.hidden || node.heading === 0 || node.parent < 0) return;
      const siblings = kids[node.parent] ?? [];
      if (siblings[0] !== index) return;
      const content = facts.nodes[siblings[1] ?? -1];
      const group = facts.nodes[node.parent];
      if (!content || !group || group.parent < 0) return;
      const groups = kids[group.parent] ?? [];
      const before = facts.nodes[groups[groups.indexOf(node.parent) - 1] ?? -1];
      if (!before) return;
      const above = group.box[1] - (before.box[1] + before.box[3]);
      const below = content.box[1] - (node.box[1] + node.box[3]);
      if (below < above * ratio) return;
      found.push(at(input, UI_HEADING_GAP.id, index, UI_HEADING_GAP.key, {}, { above, below }));
    });
    return found;
  },
};

const edgeGap: VisitRule = {
  id: UI_EDGE_GAP.id,
  run(input) {
    const { facts } = input;
    const { width, minGap, maxReported } = UI_EDGE_GAP.thresholds;
    if (input.seen.width !== width) return [];
    // A page that scrolls sideways has its own finding; the gaps mean nothing until it fits.
    if (facts.scrollWidth > facts.viewport[0] + UI_PAGE_OVERFLOW.thresholds.tolerance) return [];
    const found: RawFinding[] = [];
    for (const index of textNodes(facts)) {
      const box = facts.nodes[index]?.box ?? [0, 0, 0, 0];
      const gap = Math.min(box[0], facts.viewport[0] - (box[0] + box[2]));
      if (gap >= minGap) continue;
      found.push(at(input, UI_EDGE_GAP.id, index, UI_EDGE_GAP.key, {}, { gap: Math.round(gap) }));
    }
    return found.slice(0, maxReported);
  },
};

const strayEdge: VisitRule = {
  id: UI_STRAY_EDGE.id,
  run(input) {
    const { facts } = input;
    const { minColumn, minOffset, maxOffset, maxReported } = UI_STRAY_EDGE.thresholds;
    const left = new Map<number, number>();
    const subjects: { index: number; x: number }[] = [];
    facts.nodes.forEach((node, index) => {
      if (node.hidden) return;
      if (node.text === null && frameOf(facts, index) === null) return;
      const x = Math.round(node.box[0]);
      subjects.push({ index, x });
      left.set(x, (left.get(x) ?? 0) + 1);
    });
    const columns = [...left].filter(([, count]) => count >= minColumn).map(([x]) => x);
    const found: RawFinding[] = [];
    for (const { index, x } of subjects) {
      if (columns.includes(x)) continue;
      const near = columns
        .map((column) => ({ column, off: Math.abs(x - column) }))
        .filter(({ off }) => off >= minOffset && off <= maxOffset)
        .sort((a, b) => a.off - b.off)[0];
      if (!near) continue;
      found.push(
        at(
          input,
          UI_STRAY_EDGE.id,
          index,
          UI_STRAY_EDGE.key,
          {},
          { off: near.off, column: near.column },
        ),
      );
    }
    return found.slice(0, maxReported);
  },
};

const cardSizes: VisitRule = {
  id: UI_CARD_SIZES.id,
  run(input) {
    const { facts } = input;
    const { rowTolerance, maxHeightDiff } = UI_CARD_SIZES.thresholds;
    const found: RawFinding[] = [];
    for (const { rows } of frameRows(facts, rowTolerance)) {
      for (const row of rows) {
        const heights = row.map((index) => facts.nodes[index]?.box[3] ?? 0);
        const diff = Math.max(...heights) - Math.min(...heights);
        const first = row[0];
        if (row.length < 2 || diff <= maxHeightDiff || first === undefined) continue;
        found.push(
          at(input, UI_CARD_SIZES.id, first, UI_CARD_SIZES.key, {}, { diff: Math.round(diff) }),
        );
      }
    }
    return found;
  },
};

const orphanCard: VisitRule = {
  id: UI_ORPHAN_CARD.id,
  run(input) {
    const { rowTolerance, minFullRow } = UI_ORPHAN_CARD.thresholds;
    const found: RawFinding[] = [];
    for (const { rows } of frameRows(input.facts, rowTolerance)) {
      const last = rows[rows.length - 1];
      const lone = last?.[0];
      if (last?.length !== 1 || lone === undefined) continue;
      const full = rows.slice(0, -1).find((row) => row.length >= minFullRow);
      if (!full) continue;
      found.push(
        at(input, UI_ORPHAN_CARD.id, lone, UI_ORPHAN_CARD.key, {}, { perRow: full.length }),
      );
    }
    return found;
  },
};

const nestedFrame: VisitRule = {
  id: UI_NESTED_FRAME.id,
  run(input) {
    const { facts } = input;
    const found: RawFinding[] = [];
    facts.nodes.forEach((_node, index) => {
      if (frameOf(facts, index) === null) return;
      const outer = ancestorsOf(facts, index).find((parent) => frameOf(facts, parent) !== null);
      if (outer === undefined) return;
      found.push(at(input, UI_NESTED_FRAME.id, index, UI_NESTED_FRAME.key, {}, {}));
    });
    return found;
  },
};

const tripleFrame: VisitRule = {
  id: UI_TRIPLE_FRAME.id,
  run(input) {
    const { facts } = input;
    const found: RawFinding[] = [];
    facts.nodes.forEach((_node, index) => {
      const cues = cuesOf(facts, index);
      if (!cues?.border || !cues.shadow || !cues.fill) return;
      found.push(at(input, UI_TRIPLE_FRAME.id, index, UI_TRIPLE_FRAME.key, {}, {}));
    });
    return found;
  },
};

const shadowCount: VisitRule = {
  id: UI_SHADOW_COUNT.id,
  run(input) {
    const shadows = new Set<string>();
    for (const node of input.facts.nodes) {
      if (!node.hidden && node.style.shadow !== '') shadows.add(node.style.shadow);
    }
    if (shadows.size <= UI_SHADOW_COUNT.thresholds.maxShadows) return [];
    return [at(input, UI_SHADOW_COUNT.id, null, UI_SHADOW_COUNT.key, {}, { count: shadows.size })];
  },
};

const stickyChrome: VisitRule = {
  id: UI_STICKY_CHROME.id,
  run(input) {
    const { facts } = input;
    const height = facts.viewport[1];
    const bars = facts.fixed.filter((bar) => bar.edge === 'top' || bar.edge === 'bottom');
    const share = height > 0 ? bars.reduce((sum, bar) => sum + bar.height, 0) / height : 0;
    const first = bars[0];
    if (share <= UI_STICKY_CHROME.thresholds.maxShare || !first) return [];
    return [
      at(
        input,
        UI_STICKY_CHROME.id,
        first.node,
        UI_STICKY_CHROME.key,
        {},
        { percent: Math.round(share * 100) },
      ),
    ];
  },
};

export const UI_LAYOUT_RULES: VisitRule[] = [
  pageOverflow,
  clippedText,
  headingGap,
  edgeGap,
  strayEdge,
  cardSizes,
  orphanCard,
  nestedFrame,
  tripleFrame,
  shadowCount,
  stickyChrome,
];
