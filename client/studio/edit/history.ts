// Undo and redo of the person's own edits, and the one path edits are sent by (plan 13, task H;
// plan 14, task D1). Undo sends the inverse ops of a gesture to the current text through the same
// API: never a snapshot, so a change Claude made elsewhere in the file survives an undo.
//
// Every applied answer carries its exact inverse (spec 4b, decision 4), and the step a stack keeps
// holds it as `undoOps`. Undo sends the top step's `undoOps` and puts `{ops: sent, undoOps: the
// answer's inverse}` on the redo stack; redo does the same back. A 4a step without one (a grouped
// stepper drag) is undone by the client inverse.
//
// Ids: an answer's `renames` move the selection, the hover, hidden elements, the menu and the change
// list (`remapCurrent`). The steps keep the ids of their own time: a step is sent only after every
// later step was undone, which puts every id back as it left them (see `remap.ts`).

import type { EditOp, SimpleOp } from '../../../src/edit/index.ts';
import type { EditOutcome, EditRequest } from '../../../src/studio/api/edit-schemas.ts';
import { type Answer, postEdits } from './api.ts';
import type { History, HistoryDeps } from './context.ts';
import { previewOf } from './preview-of.ts';
import {
  invertRenames,
  originOf,
  type Renames,
  remapCurrent,
  remapStack,
  sameStep,
} from './remap.ts';
import { type ChangeEntry, elementOf, type Gesture } from './store.ts';
import { text } from './texts.ts';

/** Two edits of one property this close together are one undo step (R13): a stepper drag. */
export const GROUP_MS = 800;

/** The ports the history uses, replaceable in tests. */
export type HistoryIo = {
  post(slug: string, request: EditRequest): Promise<Answer<EditOutcome>>;
  now(): number;
};

const realIo: HistoryIo = { post: postEdits, now: () => Date.now() };

const SIMPLE: ReadonlySet<EditOp['op']> = new Set([
  'setProp',
  'removeProp',
  'setText',
  'setStyle',
  'removeStyle',
  'addClass',
  'removeClass',
]);

/** A 4a op: its inverse is made here. Structural ops get theirs from the server. */
export const isSimpleOp = (op: EditOp): op is SimpleOp => SIMPLE.has(op.op);

/**
 * The operation that undoes `op`. The same rules as `inverse` in `src/edit/domain/ops.ts`; the
 * client may not import values from `src/`, and a test keeps the two in step.
 */
export function inverse(op: SimpleOp): SimpleOp {
  switch (op.op) {
    case 'setProp':
      return op.before === null
        ? { op: 'removeProp', id: op.id, name: op.name, before: op.value, after: op.after }
        : { ...op, value: op.before, before: op.value };
    case 'removeProp':
      return {
        op: 'setProp',
        id: op.id,
        name: op.name,
        value: op.before,
        before: null,
        after: op.after,
      };
    case 'setText':
      return { ...op, value: op.before, before: op.value };
    case 'setStyle':
      return op.before === null
        ? {
            op: 'removeStyle',
            id: op.id,
            className: op.className,
            property: op.property,
            before: op.value,
            dropRule: op.newRule,
          }
        : { ...op, value: op.before, before: op.value };
    case 'removeStyle':
      return {
        op: 'setStyle',
        id: op.id,
        className: op.className,
        property: op.property,
        value: op.before,
        before: null,
        newRule: op.dropRule,
      };
    case 'addClass':
      return { op: 'removeClass', id: op.id, className: op.className };
    case 'removeClass':
      return { op: 'addClass', id: op.id, className: op.className };
  }
}

/** The inverse of a gesture: the inverses in reverse order. */
export const inverseAll = (ops: readonly SimpleOp[]): SimpleOp[] => [...ops].reverse().map(inverse);

/** The client inverse of a gesture of 4a ops; `null` when only the server knows one op's. */
export function clientInverse(ops: readonly EditOp[]): SimpleOp[] | null {
  const simple = ops.filter(isSimpleOp);
  return simple.length === ops.length ? inverseAll(simple) : null;
}

/** What undo (or redo) of `step` sends: the server's inverse, else the client's, else `null`. */
export function undoOpsOf(step: Gesture): EditOp[] | null {
  if (step.undoOps !== undefined && step.undoOps.length > 0) return step.undoOps;
  return clientInverse(step.ops);
}

/** What an op changes, for grouping; `null` for ops that are never grouped. */
export function groupKey(op: EditOp): string | null {
  switch (op.op) {
    case 'setProp':
      return `prop|${op.id}|${op.name}`;
    case 'setText':
      return `text|${op.id}`;
    case 'setStyle':
      return `style|${op.id}|${op.className}|${op.property}`;
    default:
      return null;
  }
}

/** One op that does what `first` then `second` did: the first `before`, the last value. */
function joinOps(first: EditOp, second: EditOp): EditOp {
  if (first.op === 'setProp' && second.op === 'setProp') return { ...second, before: first.before };
  if (first.op === 'setText' && second.op === 'setText') return { ...second, before: first.before };
  if (first.op === 'setStyle' && second.op === 'setStyle') {
    return { ...second, before: first.before, newRule: first.newRule };
  }
  return second;
}

/**
 * `next` folded into `top` when it is one more step of the same change, else `null`. Only 4a
 * steps fold: the server's inverse of `top` would undo only its first part, so the joined step's
 * inverse is made here.
 */
export function mergeGestures(top: Gesture, next: Gesture): Gesture | null {
  // An undo the server wrote as a patch (a word outside the list) is not rebuilt here.
  if (top.undoOps?.some((op) => op.op === 'patch')) return null;
  const [only] = next.ops;
  const last = top.ops[top.ops.length - 1];
  if (next.ops.length !== 1 || !only || !last) return null;
  const key = groupKey(only);
  if (key === null || key !== groupKey(last)) return null;
  const ops = [...top.ops.slice(0, -1), joinOps(last, only)];
  const undoOps = clientInverse(ops);
  return undoOps ? { ops, label: next.label, undoOps } : null;
}

/** A raw value written with the off-kit marker; a keyword or an image (`mark: false`) is not one. */
const isOffKit = (ops: readonly EditOp[]): boolean =>
  ops.some((op) => op.op === 'setStyle' && 'raw' in op.value && op.value.mark !== false);

/** The first element the ops name, for the change list. */
function firstElement(ops: readonly EditOp[]): string | null {
  for (const op of ops) {
    const id = elementOf(op);
    if (id !== null) return id;
  }
  return null;
}

/**
 * An insert, paste or wrap selects what it made once it exists (tasks D2, D5). Read through `in`:
 * the field is optional on `Gesture`.
 */
const wantsCreated = (gesture: Gesture): boolean =>
  'selectCreated' in gesture && gesture.selectCreated === true;

const withoutStep = (stack: Gesture[], step: Gesture): Gesture[] =>
  stack.filter((item) => !sameStep(item, step));

type Applied = Extract<EditOutcome, { outcome: 'applied' }>;
type Kind = 'apply' | 'undo' | 'redo';
/** What a conflict was about, so "keep mine" and "keep theirs" can finish the right stack. */
type Pending = { kind: Kind; original: Gesture };

export function createHistory(deps: HistoryDeps, io: HistoryIo = realIo): History {
  const { store, bridge, slug } = deps;
  let tail: Promise<unknown> = Promise.resolve();
  let pending: Pending | null = null;
  /** The last gesture that was applied by `apply`, and when; the one a new step may join. */
  let last: { gesture: Gesture; at: number } | null = null;
  /** The renames each step's own answer made, by the step as it was first stacked. */
  const stepRenames = new WeakMap<Gesture, Renames>();
  const renamesOf = (step: Gesture): Renames => stepRenames.get(originOf(step)) ?? {};

  // One request at a time: a call made while one runs waits for it.
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = tail.then(job, job);
    tail = next.catch(() => undefined);
    return next;
  }

  const entry = (ops: readonly EditOp[], label: string, id: string | null): ChangeEntry => ({
    by: 'person',
    id,
    label,
    files: [],
    offKit: isOffKit(ops),
    at: io.now(),
  });

  /** The step a stack keeps for an applied request: what was sent, and the answer's inverse. */
  function stepOf(sent: Gesture, outcome: Applied, renames: Renames): Gesture {
    const { ops, label } = sent;
    const step: Gesture =
      outcome.inverse.length > 0 ? { ops, label, undoOps: [...outcome.inverse] } : { ops, label };
    stepRenames.set(step, renames);
    return step;
  }

  function finish(kind: Kind, sent: Gesture, original: Gesture, outcome: Applied): void {
    const state = store.get();
    const etags = { ...state.etags, ...outcome.etags };
    const edit = state.edit
      ? {
          ...state.edit,
          version: outcome.version,
          session: outcome.started
            ? { version: outcome.version, startedAt: new Date(io.now()).toISOString() }
            : state.edit.session,
        }
      : state.edit;
    if (kind === 'apply') {
      const renames = outcome.renames;
      const top = state.undo[state.undo.length - 1];
      const merged =
        top && last && sameStep(last.gesture, top) && io.now() - last.at < GROUP_MS
          ? mergeGestures(top, sent)
          : null;
      const step = merged ?? stepOf(sent, outcome, renames);
      const undo = merged ? [...state.undo.slice(0, -1), merged] : [...state.undo, step];
      const line = entry(step.ops, step.label, firstElement(step.ops));
      const changes = merged ? [...state.changes.slice(0, -1), line] : [...state.changes, line];
      last = { gesture: step, at: io.now() };
      // The new line names the element as the request found it, so it follows the renames too.
      // An element the request removed leaves the selection at once: the props panel would ask
      // the server about it before the structure is read again.
      const removed = new Set(sent.ops.flatMap((op) => (op.op === 'removeElement' ? [op.id] : [])));
      const selection = state.selection.filter((id) => !removed.has(id));
      const view = remapCurrent({ ...state, changes, selection }, renames, outcome.created);
      const created =
        wantsCreated(sent) && outcome.created.length > 0 ? { selection: [...outcome.created] } : {};
      store.set({ etags, edit, undo, redo: [], changes, selection, ...view, ...created });
      return;
    }
    last = null;
    // Undoing a step turns its renames round. The server's answer says the same for the elements
    // outside the hunks it put back and wins there; inside them only the step's own renames know.
    const renames = { ...invertRenames(renamesOf(original)), ...outcome.renames };
    const step = stepOf(sent, outcome, renames);
    const view = remapCurrent(state, renames, outcome.created);
    // After an undo the step's own ops name the element as it is again; hunks name none.
    const label = text(`history.${kind}`, { label: sent.label });
    const id = firstElement(original.ops) ?? firstElement(sent.ops);
    const changes = [...(view.changes ?? state.changes), entry(sent.ops, label, id)];
    if (kind === 'undo') {
      store.set({
        etags,
        edit,
        ...view,
        changes,
        undo: withoutStep(state.undo, original),
        redo: [...state.redo, step],
      });
    } else {
      store.set({
        etags,
        edit,
        ...view,
        changes,
        redo: withoutStep(state.redo, original),
        undo: [...state.undo, step],
      });
    }
  }

  async function submit(
    kind: Kind,
    sent: Gesture,
    original: Gesture,
    force: boolean,
  ): Promise<EditOutcome | null> {
    pending = { kind, original };
    store.set({ busy: true, conflict: null, refused: null });
    const changes = sent.ops.flatMap((op) => {
      const change = previewOf(op);
      return change ? [change] : [];
    });
    if (changes.length > 0) bridge.send({ type: 'preview', changes });
    const { edit, etags } = store.get();
    const request: EditRequest | null = edit
      ? { version: edit.version, ops: sent.ops, etags, ...(force ? { force } : {}) }
      : null;
    const answer = request ? await io.post(slug, request) : null;
    if (!answer?.ok) {
      bridge.send({ type: 'unpreview' });
      store.set({ busy: false });
      return null;
    }
    const outcome = answer.body;
    if (outcome.outcome === 'applied') {
      pending = null;
      finish(kind, sent, original, outcome);
      store.set({ busy: false });
    } else if (outcome.outcome === 'conflict') {
      bridge.send({ type: 'unpreview' });
      store.set({ busy: false, conflict: { gesture: sent, outcome } });
    } else {
      pending = null;
      bridge.send({ type: 'unpreview' });
      const [first] = outcome.refusals;
      store.set({
        busy: false,
        refused: first ? { gesture: sent, index: first.index, reason: first.reason } : null,
      });
    }
    return outcome;
  }

  /** Undo or redo of the top step of its stack: its inverse, sent like any edit. */
  function back(kind: 'undo' | 'redo'): Promise<void> {
    return enqueue(async () => {
      const stack = store.get()[kind];
      const top = stack[stack.length - 1];
      if (!top) return;
      const ops = undoOpsOf(top);
      if (ops === null) {
        // No inverse is known for it (the server sent none): left on top, it would block every
        // older step.
        const rest = withoutStep(stack, top);
        store.set(kind === 'undo' ? { undo: rest } : { redo: rest });
        return;
      }
      await submit(kind, { ops, label: top.label }, top, false);
    });
  }

  return {
    apply: (gesture) => enqueue(() => submit('apply', gesture, gesture, false)),
    undo: () => back('undo'),
    redo: () => back('redo'),
    keepMine: () =>
      enqueue(async () => {
        const { conflict, etags } = store.get();
        if (!conflict) return;
        const { gesture, outcome } = conflict;
        store.set({ etags: { ...etags, [outcome.file]: outcome.etag } });
        const kind = pending?.kind ?? 'apply';
        await submit(kind, gesture, pending?.original ?? gesture, true);
      }),
    keepTheirs() {
      const { conflict, etags, undo, redo } = store.get();
      if (!conflict) return;
      const original = pending?.original;
      const kind = pending?.kind;
      // An undo that keeps theirs leaves its step done: the steps under it, made before it, take
      // its renames, as they would have had they been made after it.
      const keptUndo =
        kind === 'undo' && original
          ? remapStack(withoutStep(undo, original), renamesOf(original))
          : undo;
      store.set({
        etags: { ...etags, [conflict.outcome.file]: conflict.outcome.etag },
        conflict: null,
        undo: keptUndo,
        redo: kind === 'redo' && original ? withoutStep(redo, original) : redo,
      });
      pending = null;
      last = null;
    },
  };
}
