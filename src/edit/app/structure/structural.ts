// The structural ops of an edit request (spec 4b, decisions 2 to 9; plan 14, task B3). Each op
// finds its elements in the request's texts (`request-state.ts`), checks what only the app can
// check (the catalog, the scope rule, interactive nesting), lets the engine splice
// (`apply-structure.ts`), and keeps the result with the kit import made to follow use.

import type { Place, StructuralOp } from '../../domain/ops.ts';
import {
  applyStructure,
  type Located,
  type TreeOp,
} from '../../domain/structure/apply-structure.ts';
import { contextOf, elementSpan, parentOf } from '../../domain/structure/subtree.ts';
import { openingTags, readTag } from '../../domain/tsx/apply-tsx.ts';
import { indentAt, reindent, sourceIndent } from '../../domain/tsx/format.ts';
import type { OffsetMap, Span } from '../../domain/types.ts';
import { catalogComponent } from '../edit-state.ts';
import {
  accepts,
  commit,
  compose,
  type Found,
  inInteractive,
  interactive,
  interactiveIn,
  kitNamesOf,
  kitOf,
  locate,
  type OpResult,
  type Stop,
  same,
  startOf,
  stateOf,
  syncImports,
  type Work,
  whole,
} from '../request-state.ts';
import { carryAcross, carryCopy, checkPaste, checkScope } from './carry.ts';
import { applyListOp } from './list-ops.ts';
import { replaceNeeds } from './replace-scope.ts';
import { replaceTagOpen } from './replace-tag.ts';
import { resolveReset } from './reset.ts';
import { applySectionOp } from './sections.ts';

/** The element ops and the section ops; `patch` and `file` are the pipeline's own. */
export type ShapeOp = Exclude<StructuralOp, { op: 'patch' | 'file' }>;
type OpOf<K extends ShapeOp['op']> = Extract<ShapeOp, { op: K }>;

type Applied = { text: string; moved: OffsetMap; created: number[] };
/** The anchor's text made ready for a child, and where its offsets went on the way. */
type Ready = { text: string; moved: OffsetMap };
type Change = { file: string; text: string };

function engine(file: string, text: string, at: Located, op: TreeOp, work: Work): Applied | Stop {
  const result = applyStructure(text, at, op, work.options);
  if ('conflict' in result) return { conflict: 'changed', file };
  if ('refused' in result) return { refused: result.refused };
  return result;
}

/** Keeps an engine's change of `file`; `before`: the opening of a self-closing anchor. */
function keep(
  work: Work,
  file: string,
  index: number,
  applied: Applied,
  created: boolean,
  before: OffsetMap = same,
): void {
  commit(work, file, index, applied.text, compose(before, applied.moved));
  if (created) for (const at of applied.created) work.created.push({ file, at });
  syncImports(work, file, index);
}

/**
 * The anchor's text made ready for `subtree` at `place` (decision 6): a child goes inside only an
 * element that accepts one, a self-closing one is opened first (the engine leaves that to the
 * app, which has the catalog), and an interactive element never lands inside an interactive one.
 */
function prepare(work: Work, anchor: Found, place: Place, subtree: string): Ready | Stop {
  const { loaded } = kitOf(work);
  const inside = place === 'first' || place === 'last';
  const around = inside ? anchor.at : parentOf(anchor.text, anchor.at);
  const nested =
    interactiveIn(loaded, subtree, whole(subtree)) && inInteractive(loaded, anchor.text, around);
  if (nested) return { refused: 'nested-interactive' };
  const view = inside ? readTag(anchor.text, anchor.at) : 'not-found';
  // Beside the anchor, or inside a fragment (no tag to read): the engine decides.
  if (typeof view === 'string') return { text: anchor.text, moved: same };
  if (!accepts(loaded, view.name)) return { refused: 'not-accepted' };
  const { start, end } = view.span;
  const tag = anchor.text.slice(start, end);
  const close = tag.search(/[ \t]*\/>$/);
  if (!view.selfClosing || close < 0) return { text: anchor.text, moved: same };
  // `<Card />` becomes `<Card></Card>`; only the end of its tag changes.
  const opened = `${tag.slice(0, close)}></${view.name}>`;
  const text = anchor.text.slice(0, start) + opened + anchor.text.slice(end);
  const cut = start + close;
  const shift = opened.length - tag.length;
  return { text, moved: (old) => (old < cut ? old : old < end ? null : old + shift) };
}

/** The SCSS file of a section's TSX file and its text now; `null` when it has none. */
function scssOf(work: Work, tsx: string): Change | null {
  const file = work.deps.sectionScss(work.slug, work.version, tsx);
  const text = file === null ? null : stateOf(work, file).text;
  return file === null || text === null ? null : { file, text };
}

/**
 * The SCSS files whose text a carry of class rules changed (decision 9). A rule that would have
 * to go into a section without an SCSS file (a sketch) has nowhere to be written: refused.
 */
function scssChanges(carried: { scss: Change | null; next: string | null }[]): Change[] | Stop {
  const changes: Change[] = [];
  for (const { scss, next } of carried) {
    if (next === (scss?.text ?? null)) continue;
    if (scss === null || next === null) return { refused: 'not-found' };
    changes.push({ file: scss.file, text: next });
  }
  return changes;
}

/** A copy from another section brings the rules of its classes; that section keeps its own. */
function copyRules(work: Work, from: string, to: string, source: string): Change[] | Stop {
  const target = scssOf(work, to);
  const fromScss = scssOf(work, from)?.text ?? null;
  const copied = carryCopy({ source, fromScss, targetScss: target?.text ?? null });
  return 'refused' in copied ? copied : scssChanges([{ scss: target, next: copied.targetScss }]);
}

/** A subtree written again at `at` of `to`: its elements in source order, old `<` → new `<`. */
function pairElements(
  from: string,
  span: Span,
  to: string,
  at: number | undefined,
): Map<number, number> {
  const pairs = new Map<number, number>();
  const copy = at === undefined ? null : elementSpan(to, at);
  if (copy === null) return pairs;
  const within = (text: string, range: Span) =>
    openingTags(text).filter((tag) => tag >= range.start && tag < range.end);
  const olds = within(from, span);
  const news = within(to, copy);
  if (olds.length !== news.length) return pairs;
  olds.forEach((old, i) => {
    const next = news[i];
    if (next !== undefined) pairs.set(old, next);
  });
  return pairs;
}

async function moveElement(work: Work, index: number, op: OpOf<'moveElement'>): Promise<OpResult> {
  const target = await locate(work, op.id);
  if (!('at' in target)) return target;
  const anchor = await locate(work, op.anchor);
  if (!('at' in anchor)) return anchor;
  const span = elementSpan(target.text, target.at);
  if (span === null) return { refused: 'not-found' };
  const scope = checkScope(target.text, span, anchor.text, anchor.at, kitOf(work).names);
  if (scope !== null) return { refused: scope };
  const ready = prepare(work, anchor, op.place, target.text.slice(span.start, span.end));
  if (!('moved' in ready)) return ready;
  if (target.file !== anchor.file) {
    return moveAcross(work, index, op, { target, anchor, span, ready });
  }
  const from = ready.moved(target.at);
  if (from === null) return { refused: 'not-found' };
  const tree: TreeOp = { op: 'moveElement', place: op.place, hash: op.hash };
  const moved = engine(target.file, ready.text, { target: from, anchor: anchor.at }, tree, work);
  if (!('moved' in moved)) return moved;
  keep(work, target.file, index, moved, false, ready.moved);
  return 'done';
}

/**
 * A move to another section or sketch: a removal in one file and an insertion in the other, with
 * the class rules the subtree uses, in one request. The moved elements keep their identity.
 */
function moveAcross(
  work: Work,
  index: number,
  op: OpOf<'moveElement'>,
  at: { target: Found; anchor: Found; span: Span; ready: Ready },
): OpResult {
  const { target, anchor, span, ready } = at;
  // Nothing moves into or out of a prop's JSX (decision 6).
  const slot =
    contextOf(target.text, target.at) === 'slot' || contextOf(anchor.text, anchor.at) === 'slot';
  if (slot) return { refused: 'slot-root' };
  const source = target.text.slice(span.start, span.end);
  const taken: TreeOp = { op: 'removeElement', hash: op.hash };
  const removed = engine(target.file, target.text, { target: target.at }, taken, work);
  if (!('moved' in removed)) return removed;
  const put: TreeOp = { op: 'insertElement', place: op.place, source };
  const inserted = engine(anchor.file, ready.text, { anchor: anchor.at }, put, work);
  if (!('moved' in inserted)) return inserted;
  // The class rules go along, and leave the source section when nothing there uses them.
  const from = scssOf(work, target.file);
  const to = scssOf(work, anchor.file);
  const carried = carryAcross({
    sourceText: target.text,
    sourceScss: from?.text ?? null,
    targetText: anchor.text,
    targetScss: to?.text ?? null,
    subtree: span,
    targetAt: anchor.at,
  });
  if ('refused' in carried) return carried;
  const rules = scssChanges([
    { scss: to, next: carried.targetScss },
    { scss: from, next: carried.sourceScss },
  ]);
  if (!Array.isArray(rules)) return rules;

  const pairs = pairElements(target.text, span, inserted.text, inserted.created[0]);
  commit(work, anchor.file, index, inserted.text, compose(ready.moved, inserted.moved));
  // The places inside the subtree go to its copy before the removal takes them.
  for (const [id, spot] of work.track) {
    if (spot === null || spot.file !== target.file || spot.at < span.start) continue;
    if (spot.at >= span.end) continue;
    const copy = pairs.get(spot.at);
    const there = { file: anchor.file, tag: spot.tag, own: false };
    work.track.set(id, copy === undefined ? null : { ...there, at: copy });
  }
  commit(work, target.file, index, removed.text, removed.moved);
  for (const rule of rules) commit(work, rule.file, index, rule.text, same);
  syncImports(work, target.file, index);
  syncImports(work, anchor.file, index);
  return 'done';
}

async function insertElement(
  work: Work,
  index: number,
  op: OpOf<'insertElement'>,
): Promise<OpResult> {
  const anchor = await locate(work, op.anchor);
  if (!('at' in anchor)) return anchor;
  // The scope rule (decision 6): a duplicate in its own function may read what that function
  // has; every other source names only kit components, HTML tags and literals.
  const target = { text: anchor.text, at: anchor.at };
  const refusal = checkPaste(op.source, kitOf(work).names, target);
  if (refusal !== null) return { refused: refusal };
  const ready = prepare(work, anchor, op.place, op.source);
  if (!('moved' in ready)) return ready;
  const put: TreeOp = { op: 'insertElement', place: op.place, source: op.source };
  const inserted = engine(anchor.file, ready.text, { anchor: anchor.at }, put, work);
  if (!('moved' in inserted)) return inserted;
  // A copy from another section brings its class rules. Its own section keeps them: the copied
  // element may still use them there, and after a cut an unused rule harms nothing.
  const from = op.from === undefined || op.from === anchor.file ? null : op.from;
  const rules = from === null ? [] : copyRules(work, from, anchor.file, op.source);
  if (!Array.isArray(rules)) return rules;
  keep(work, anchor.file, index, inserted, true, ready.moved);
  for (const rule of rules) commit(work, rule.file, index, rule.text, same);
  return 'done';
}

/** An op on one element that needs nothing but the engine: remove, unwrap. */
async function treeOp(work: Work, index: number, id: string, op: TreeOp): Promise<OpResult> {
  const target = await locate(work, id);
  if (!('at' in target)) return target;
  const applied = engine(target.file, target.text, { target: target.at }, op, work);
  if (!('moved' in applied)) return applied;
  keep(work, target.file, index, applied, false);
  return 'done';
}

async function wrapElements(
  work: Work,
  index: number,
  op: OpOf<'wrapElements'>,
): Promise<OpResult> {
  const first = await locate(work, op.first);
  if (!('at' in first)) return first;
  const last = await locate(work, op.last);
  if (!('at' in last)) return last;
  if (first.file !== last.file) return { refused: 'not-siblings' };
  const { loaded } = kitOf(work);
  const name = /^<([A-Za-z][\w.]*)/.exec(op.open.trim())?.[1];
  if (name === undefined) return { refused: 'invalid' };
  if (/^[A-Z]/.test(name) && catalogComponent(loaded, name) === null) {
    return { refused: 'unknown-component' };
  }
  if (!accepts(loaded, name)) return { refused: 'not-accepted' };
  const range = { start: first.at, end: elementSpan(last.text, last.at)?.end ?? first.at };
  const nested =
    interactiveIn(loaded, first.text, range) ||
    inInteractive(loaded, first.text, parentOf(first.text, first.at));
  if (interactive(loaded, name) && nested) return { refused: 'nested-interactive' };
  const tree: TreeOp = { op: 'wrapElements', open: op.open, hash: op.hash };
  const applied = engine(first.file, first.text, { first: first.at, last: last.at }, tree, work);
  if (!('moved' in applied)) return applied;
  keep(work, first.file, index, applied, true);
  return 'done';
}

async function replaceTag(work: Work, index: number, op: OpOf<'replaceTag'>): Promise<OpResult> {
  const target = await locate(work, op.id);
  if (!('at' in target)) return target;
  const { loaded } = kitOf(work);
  const view = readTag(target.text, target.at);
  if (typeof view === 'string') return { refused: view };
  const to = catalogComponent(loaded, op.tag);
  if (to === null) return { refused: 'unknown-component' };
  const made = replaceTagOpen(view, catalogComponent(loaded, view.name), to, op.tag, target.text);
  if ('refused' in made) return { refused: made.refused };
  const end = elementSpan(target.text, target.at)?.end ?? view.span.end;
  const nested =
    interactiveIn(loaded, target.text, { start: target.at + 1, end }) ||
    inInteractive(loaded, target.text, parentOf(target.text, target.at));
  if (interactive(loaded, op.tag) && nested) return { refused: 'nested-interactive' };
  const tree: TreeOp = { op: 'replaceOpen', open: made.open, hash: op.hash };
  const applied = engine(target.file, target.text, { target: target.at }, tree, work);
  if (!('moved' in applied)) return applied;
  // The same element under another tag, at the same `<`: the selection follows it.
  const spot = work.track.get(op.id);
  if (spot) work.track.set(op.id, { ...spot, tag: op.tag, own: false });
  work.dropped.push(...made.dropped.filter((prop) => !work.dropped.includes(prop)));
  keep(work, target.file, index, applied, false);
  return 'done';
}

async function replaceElement(
  work: Work,
  index: number,
  op: OpOf<'replaceElement'>,
): Promise<OpResult> {
  const target = await locate(work, op.id);
  if (!('at' in target)) return target;
  const { loaded, names } = kitOf(work);
  const place = { text: target.text, at: target.at };
  const refusal = checkPaste(op.source, names, place);
  // Spec 4d (bring back, kit suggestions): a source that stands where an element stood may read
  // what the file has there. The paste rule's refusal stays when a name is still missing.
  if (refusal !== null) {
    const needs = refusal === 'invalid' ? null : replaceNeeds(op.source, names, place);
    if (needs === null || needs.missing.length > 0) return { refused: refusal };
  }
  const around = parentOf(target.text, target.at);
  const nested =
    interactiveIn(loaded, op.source, whole(op.source)) &&
    inInteractive(loaded, target.text, around);
  if (nested) return { refused: 'nested-interactive' };
  const tree: TreeOp = { op: 'replaceElement', source: op.source, hash: op.hash };
  const applied = engine(target.file, target.text, { target: target.at }, tree, work);
  if (!('moved' in applied)) return applied;
  keep(work, target.file, index, applied, true);
  return 'done';
}

/** The element as the session started with it (decision 15), found through the rename log. */
async function resetElement(
  work: Work,
  index: number,
  op: OpOf<'resetElement'>,
): Promise<OpResult> {
  // The id as the editor sent it: the log leads it back to the session's start (task B2).
  const { drafts, compiler } = work.deps;
  const reset = await resolveReset({ drafts, compiler }, work.slug, work.version, op.id);
  if ('refused' in reset) return { refused: reset.refused };
  const target = await locate(work, op.id);
  if (!('at' in target)) return target;
  // The start's source is a raw slice: its later lines move to the element's depth now.
  const depth = indentAt(target.text, target.at);
  const source = reindent(reset.source, sourceIndent(reset.source), depth);
  const tree: TreeOp = { op: 'replaceElement', source, hash: op.hash };
  const applied = engine(target.file, target.text, { target: target.at }, tree, work);
  if (!('moved' in applied)) return applied;
  // Not `created`: it is the element the session started with, so a later reset still finds it.
  keep(work, target.file, index, applied, false);
  return 'done';
}

/** `moveSection`, `insertSection`, `removeSection`: the layout and section files (task B5). */
async function sectionOp(
  work: Work,
  index: number,
  op: OpOf<'moveSection' | 'insertSection' | 'removeSection'>,
): Promise<OpResult> {
  const deps = { drafts: work.deps.drafts, kitNames: (slug: string) => kitNamesOf(work, slug) };
  // `undefined` for a file that is not there, also one an earlier op of the request removed.
  const current = (file: string): string | undefined => stateOf(work, file).text ?? undefined;
  const result = applySectionOp(deps, work.slug, work.version, op, current);
  if ('refused' in result) return { refused: result.refused };
  for (const { file, text } of result.files) {
    // A removed section's elements are taken first, so a later op naming one is `not-found`.
    if (file.endsWith('.tsx')) await startOf(work, file);
    // Layout blocks and whole files: no element of them keeps its place to follow.
    if (stateOf(work, file).text !== text) commit(work, file, index, text, () => null);
  }
  return 'done';
}

export function applyStructural(work: Work, index: number, op: ShapeOp): Promise<OpResult> {
  switch (op.op) {
    case 'moveElement':
      return moveElement(work, index, op);
    case 'insertElement':
      return insertElement(work, index, op);
    case 'removeElement':
      return treeOp(work, index, op.id, { op: 'removeElement', hash: op.hash });
    case 'unwrapElement':
      return treeOp(work, index, op.id, { op: 'unwrapElement', hash: op.hash });
    case 'wrapElements':
      return wrapElements(work, index, op);
    case 'replaceTag':
      return replaceTag(work, index, op);
    case 'replaceElement':
      return replaceElement(work, index, op);
    case 'resetElement':
      return resetElement(work, index, op);
    // Data lists (plan 16, task D).
    case 'moveItem':
    case 'duplicateItem':
    case 'removeItem':
    case 'setItemText':
      return applyListOp(work, index, op);
    default:
      return sectionOp(work, index, op);
  }
}
