// The live findings as plain data (spec 4c, goals 5 and 8; plan 16, task C): a card's facts and
// the server's code findings turned into `store.live` items, an answer replacing the earlier items
// of what it measured, the items grouped by element with their numbers, the marks each card gets,
// and what the editor showed for an edit (held against the build). No DOM here.

import type { EditOp, StyleState } from '../../../../src/edit/index.ts';
import type { LiveCodeFinding } from '../../../../src/studio/api/edit/live-schemas.ts';
import type { Waiver } from '../../../../src/studio/api/waivers/waiver-schemas.ts';
import type { TreeNode } from '../../../channel/edit-protocol.ts';
import {
  type Expected,
  type LiveFact,
  type LiveRule,
  MAX_EXPECT,
} from '../../../channel/live-protocol.ts';
import type { EditorState, Gesture, LiveItem } from '../store.ts';
import { previewOf } from '../style/preview-of.ts';
import { text } from '../texts.ts';
import { type Evidence, evidenceOf, type Values } from './evidence.ts';

/**
 * A live item that keeps what its card measured (plan 18): the Checks tab shows it as evidence.
 * A code finding has no values; its message is its evidence.
 */
export type MeasuredItem = LiveItem & { values?: Values };

/**
 * The rule a measured fact is filed under: the full check's own where it has one, so a waiver
 * made on a live finding also covers what `kitvas check` finds there.
 */
export const LIVE_RULE_IDS: Record<LiveRule, string> = {
  contrast: 'a11y/color-contrast',
  'target-size': 'a11y/target-size',
  overflow: 'live/overflow',
  clipped: 'ui/clipped-text',
  mismatch: 'live/mismatch',
};
export const MISMATCH_RULE = LIVE_RULE_IDS.mismatch;

/** The words of one fact, under `studio.edit.live.fact.*`. */
export function factText(fact: LiveFact): string {
  const values = fact.values;
  const of = (name: string): string | number => values[name] ?? '?';
  switch (fact.rule) {
    case 'contrast':
      return text('live.fact.contrast', { ratio: of('ratio'), needed: of('needed') });
    case 'target-size':
      return text('live.fact.target', { width: of('width'), height: of('height') });
    case 'overflow':
      return text('live.fact.overflow', { content: of('content'), width: of('width') });
    case 'clipped':
      return text('live.fact.clipped');
    case 'mismatch':
      return text('live.fact.mismatch', {
        property: of('property'),
        expected: of('expected'),
        actual: of('actual'),
      });
  }
}

/** A card's facts as items, at the card's width, with the values each fact measured. */
export const frameItems = (facts: readonly LiveFact[], width: number): MeasuredItem[] =>
  facts.map(
    (fact): MeasuredItem => ({
      id: fact.id,
      rule: LIVE_RULE_IDS[fact.rule],
      severity: fact.severity,
      width,
      message: factText(fact),
      source: 'frame',
      values: fact.values,
    }),
  );

/**
 * What one measurement covered: the elements it named, everything under them in the layers tree,
 * and every element a fact came from.
 */
export function coveredIds(
  named: readonly string[],
  tree: readonly TreeNode[],
  facts: readonly LiveFact[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of tree) {
    if (node.parent === null) continue;
    const list = children.get(node.parent);
    if (list) list.push(node.id);
    else children.set(node.parent, [node.id]);
  }
  const covered = new Set<string>();
  const queue = [...named];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (covered.has(id)) continue;
    covered.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  for (const fact of facts) covered.add(fact.id);
  return covered;
}

/** The frame items after one card's answer: its earlier items of the covered elements make way. */
export function withFrameAnswer(
  items: readonly MeasuredItem[],
  answer: { width: number; facts: readonly LiveFact[] },
  covered: ReadonlySet<string>,
): MeasuredItem[] {
  const replaced = (item: LiveItem): boolean => {
    if (item.source !== 'frame' || item.width !== answer.width) return false;
    return item.id !== null && covered.has(item.id);
  };
  return [...items.filter((item) => !replaced(item)), ...frameItems(answer.facts, answer.width)];
}

/** `pricing.scss` for `src/scss/sections/pricing.scss`. */
const shortFile = (file: string): string => file.split('/').pop() ?? file;

/** A code finding of the server as an item; its place is part of the words. */
export function codeItem(finding: LiveCodeFinding): LiveItem {
  const file = shortFile(finding.file);
  const place = finding.line > 0 ? `${file}:${finding.line}` : file;
  return {
    id: finding.element,
    rule: finding.rule,
    severity: finding.severity,
    width: null,
    message: text('live.code', { message: finding.message, place }),
    source: 'code',
  };
}

/** The files whose ETag is new or changed since `before`. */
export function changedFiles(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(after).filter((file) => before[file] !== after[file]);
}

/**
 * The code items by file after an applied request: every file it wrote, and every file a finding
 * names, gets the request's findings in place of the earlier ones (a file with none drops out).
 */
export function withCodeAnswer(
  byFile: ReadonlyMap<string, LiveItem[]>,
  files: readonly string[],
  findings: readonly LiveCodeFinding[],
): Map<string, LiveItem[]> {
  const next = new Map(byFile);
  for (const file of new Set([...files, ...findings.map((finding) => finding.file)])) {
    const items = findings.filter((finding) => finding.file === file).map(codeItem);
    if (items.length > 0) next.set(file, items);
    else next.delete(file);
  }
  return next;
}

export const isWaived = (
  waivers: readonly Waiver[],
  rule: string,
  element: string | null,
): boolean => waivers.some((waiver) => waiver.rule === rule && waiver.element === element);

/** One line of a group: the same finding at several widths is one line. */
export type LiveRow = {
  rule: string;
  severity: 'fix' | 'review';
  message: string;
  source: 'frame' | 'code';
  /** The card widths it was measured at, ascending; empty for a code finding. */
  widths: number[];
  waived: boolean;
  /** What the first card that found it measured; a code finding's is its message. */
  evidence: Evidence;
  /** The values that card measured, for the fix Apply makes (ADR 0061); `null` for a code finding. */
  values: Values | null;
};

/** The findings of one element (`id: null`: those of no element), and its number on the canvas. */
export type LiveGroup = {
  id: string | null;
  /** `L1`, `L2`…: only while a finding of it is not waived. */
  label: string | null;
  tone: 'fix' | 'review';
  rows: LiveRow[];
};

const sameFinding = (row: LiveRow, item: LiveItem): boolean =>
  row.rule === item.rule && row.message === item.message && row.source === item.source;

/** Items grouped by element in the order they came, the ones of no element last, then numbered. */
export function liveGroups(
  items: readonly MeasuredItem[],
  waivers: readonly Waiver[],
): LiveGroup[] {
  const groups = new Map<string | null, LiveRow[]>();
  for (const item of items) {
    const rows = groups.get(item.id) ?? [];
    groups.set(item.id, rows);
    const same = rows.find((row) => sameFinding(row, item));
    if (same) {
      if (item.width !== null && !same.widths.includes(item.width)) {
        same.widths = [...same.widths, item.width].sort((a, b) => a - b);
      }
      if (item.severity === 'fix') same.severity = 'fix';
      continue;
    }
    rows.push({
      rule: item.rule,
      severity: item.severity,
      message: item.message,
      source: item.source,
      widths: item.width === null ? [] : [item.width],
      waived: isWaived(waivers, item.rule, item.id),
      evidence: evidenceOf({ message: item.message, values: item.values ?? null }),
      values: item.values ?? null,
    });
  }
  const last = (id: string | null): number => Number(id === null);
  const ordered = [...groups.entries()].sort(([a], [b]) => last(a) - last(b));
  let number = 0;
  return ordered.map(([id, rows]): LiveGroup => {
    const open = rows.filter((row) => !row.waived);
    const tone = open.some((row) => row.severity === 'fix') ? 'fix' : 'review';
    const marked = id !== null && open.length > 0;
    if (marked) number += 1;
    return { id, label: marked ? `L${number}` : null, tone, rows };
  });
}

/** One live mark, as the frame draws it. */
export type LiveMarkItem = { id: string; label: string; tone: 'fix' | 'review' };

/**
 * The marks of a card at `width`: each numbered element with a finding still open there (a
 * measurement at that width, or a code finding, which holds at every width).
 */
export function liveMarks(groups: readonly LiveGroup[], width: number): LiveMarkItem[] {
  const marks: LiveMarkItem[] = [];
  for (const group of groups) {
    if (group.id === null || group.label === null) continue;
    const open = group.rows.filter(
      (row) => !row.waived && (row.source === 'code' || row.widths.includes(width)),
    );
    if (open.length === 0) continue;
    const tone = open.some((row) => row.severity === 'fix') ? 'fix' : 'review';
    marks.push({ id: group.id, label: group.label, tone });
  }
  return marks;
}

/**
 * Elements whose build shows another value than the editor did: the change list puts a warning
 * sign on their entries (spec 4c, goal 8).
 */
export function mismatchedIds(items: readonly LiveItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) if (item.rule === MISMATCH_RULE && item.id !== null) ids.add(item.id);
  return ids;
}

/** The two undo stacks' tops when a request starts, to tell afterwards which step it sent. */
export type Tops = {
  undo: Gesture | undefined;
  redo: Gesture | undefined;
  undoLength: number;
  redoLength: number;
};

export const topsOf = (state: Pick<EditorState, 'undo' | 'redo'>): Tops => ({
  undo: state.undo[state.undo.length - 1],
  redo: state.redo[state.redo.length - 1],
  undoLength: state.undo.length,
  redoLength: state.redo.length,
});

/**
 * The ops the last applied request sent: an undo leaves the step it sent on top of the redo
 * stack, an edit or a redo on top of the undo stack (`history.ts`). None when neither moved.
 */
export function sentOps(before: Tops, after: Tops): EditOp[] {
  if (after.redo && after.redo !== before.redo && after.redoLength > before.redoLength) {
    return after.redo.ops;
  }
  if (after.undo && after.undo !== before.undo) return after.undo.ops;
  return [];
}

/**
 * What the editor showed for `ops` (`preview-of.ts`), for the edit card to hold against the
 * build. Only values of the context the edit card is in (`width` and `state`, as
 * `store.context`): another card may show another width's block. A state edit is checked while
 * that state is forced, as the frame measures it forced (ADR 0055: the kit's own state rule may
 * win).
 */
export function expectations(
  ops: readonly EditOp[],
  width: number | null,
  state: StyleState | null = null,
): Expected[] {
  const wanted = new Map<string, Expected>();
  for (const op of ops) {
    if (op.op !== 'setStyle') continue;
    const context = op.context ?? { width: null, state: null };
    if (context.state !== state || context.width !== width) continue;
    const change = previewOf(op);
    if (change?.kind !== 'style') continue;
    const { id, property, value } = change;
    wanted.set(`${id}|${property}`, { id, property, value });
  }
  return [...wanted.values()].slice(0, MAX_EXPECT);
}

/** Expectations of two requests that wait for one build: the later value of a property wins. */
export function joinExpectations(
  first: readonly Expected[],
  next: readonly Expected[],
): Expected[] {
  const joined = new Map<string, Expected>();
  for (const one of [...first, ...next]) joined.set(`${one.id}|${one.property}`, one);
  return [...joined.values()].slice(0, MAX_EXPECT);
}
