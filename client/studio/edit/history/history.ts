// Undo and redo of the person's own edits, and the one path edits are sent by (plan 13, task H;
// plan 14, task D1). Undo sends the inverse ops of a gesture to the current text through the same
// API: never a snapshot, so a change Claude made elsewhere in the file survives an undo.
//
// Every applied answer carries its exact inverse (spec 4b, decision 4), and the step a stack keeps
// holds it as `undoOps`. Undo sends the top step's `undoOps` and puts `{ops: sent, undoOps: the
// answer's inverse}` on the redo stack; redo does the same back. A 4a step without one (a grouped
// stepper drag) is undone by the client inverse: `inverseAll` of the server's ops module itself
// (`src/edit/domain/op-kinds.ts`, ADR 0080).
//
// Ids: an answer's `renames` move the selection, the hover, hidden elements, the menu and the change
// list (`remapCurrent`). The steps keep the ids of their own time: a step is sent only after every
// later step was undone, which puts every id back as it left them (see `remap.ts`). The chosen
// copies of the selection follow their elements (ADR 0065, `copiesAfter`).
//
// A request that gets no answer, or an error, saves nothing: both stacks stay as they were and
// `failed` tells the person (ADR 0061). The stacks and the change list are kept across a reload by
// `keep.ts`, so a step carries its own renames.

import { inverseAll, isSimpleOp } from '../../../../src/edit/domain/op-kinds.ts';
import type { EditOp, SimpleOp } from '../../../../src/edit/index.ts';
import type {
  EditOutcome,
  EditRequest,
  EditState,
} from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { CopyRef } from '../../../channel/edit-protocol.ts';
import { type Answer, getEditState, postEdits } from '../api.ts';
import type { History, HistoryDeps } from '../context.ts';
import { copiesAfter } from '../select/copies.ts';
import { elementOf, type Gesture } from '../store.ts';
import { previewOf } from '../style/preview-of.ts';
import {
  invertRenames,
  originOf,
  type Renames,
  remapCurrent,
  remapStack,
  sameStep,
} from '../sync/remap.ts';
import { text } from '../texts.ts';
import { appliedNote } from './applied.ts';
import { valuesOf } from './change-chips.ts';
import { opChips, type StepEntry } from './chips.ts';

/** Two edits of one property this close together are one undo step (R13): a stepper drag. */
export const GROUP_MS = 800;

/** The ports the history uses, replaceable in tests. */
export type HistoryIo = {
  post(slug: string, request: EditRequest): Promise<Answer<EditOutcome>>;
  now(): number;
  /** The edit state, read again after the first edit of a session for its true `startedAt`. */
  state?(slug: string): Promise<Answer<EditState>>;
};

const realIo: HistoryIo = { post: postEdits, now: () => Date.now(), state: getEditState };

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

/**
 * Whether an id names no element of before the answer any more: the request removed it, or its
 * name went to another element (one renamed to it, or one the answer created).
 */
export function goneAfter(
  renames: Renames,
  created: readonly string[],
  removed: ReadonlySet<string> = new Set(),
): (id: string) => boolean {
  const taken = new Set([...Object.values(renames), ...created]);
  return (id) => removed.has(id) || (!Object.hasOwn(renames, id) && taken.has(id));
}

/**
 * The chosen copies after an undo or a redo: each follows its element's id. Text a patch put
 * back may have moved the items of a list, so a copy named by its place in one may be another
 * item now: it is dropped, and its element stays selected as itself.
 */
export function copiesBack(
  copies: readonly CopyRef[],
  sent: readonly EditOp[],
  renames: Renames,
  created: readonly string[],
): CopyRef[] {
  const patched = sent.some((op) => op.op === 'patch' || op.op === 'file');
  return copiesAfter(copies, renames, goneAfter(renames, created)).filter(
    (copy) => !(patched && copy.path !== undefined),
  );
}

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
  /** The renames the step's own answer made; a remapped copy carries those of its first stacking. */
  const renamesOf = (step: Gesture): Renames => step.renames ?? originOf(step).renames ?? {};

  // One request at a time: a call made while one runs waits for it.
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = tail.then(job, job);
    tail = next.catch(() => undefined);
    return next;
  }

  // The Changes rail shows what each step changed as chips (plan 18): the line carries them.
  // The op's own `before` is what the panel read before the edit; `valuesOf` keeps it with the
  // new value on the line (plan 18f).
  const entry = (ops: readonly EditOp[], label: string, id: string | null): StepEntry => {
    const chips = opChips(ops);
    return {
      by: 'person',
      id,
      label,
      files: [],
      offKit: isOffKit(ops),
      at: io.now(),
      chips,
      ...valuesOf(chips),
    };
  };

  /** The step a stack keeps for an applied request: what was sent, and the answer's inverse. */
  function stepOf(sent: Gesture, outcome: Applied, renames: Renames): Gesture {
    const { ops, label } = sent;
    const step: Gesture =
      outcome.inverse.length > 0 ? { ops, label, undoOps: [...outcome.inverse] } : { ops, label };
    if (Object.keys(renames).length > 0) step.renames = { ...renames };
    return step;
  }

  /**
   * The first edit of a session opened it, and the page named its start by its own clock. The
   * server's `startedAt` is read once, since it names the session the kept history belongs to.
   */
  async function learnSession(version: number): Promise<void> {
    const answer = await io.state?.(slug);
    const session = answer?.ok ? answer.body.session : null;
    const { edit } = store.get();
    if (!session || !edit?.session || session.version !== version) return;
    if (edit.session.version !== version || edit.session.startedAt === session.startedAt) return;
    store.set({ edit: { ...edit, session } });
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
      // What stays selected stays on its copies; the store drops those of ids that left.
      const gone = goneAfter(renames, outcome.created, removed);
      const copies = copiesAfter(state.copies, renames, gone);
      store.set({ etags, edit, undo, redo: [], changes, selection, copies, ...view, ...created });
      return;
    }
    last = null;
    // Undoing a step turns its renames round. The server's answer says the same for the elements
    // outside the hunks it put back and wins there; inside them only the step's own renames know.
    const renames = { ...invertRenames(renamesOf(original)), ...outcome.renames };
    const step = stepOf(sent, outcome, renames);
    const moved = remapCurrent(state, renames, outcome.created);
    const kept = copiesBack(state.copies, sent.ops, renames, outcome.created);
    // The copies are set with the selection, which the store settles them by.
    const chosen =
      moved.selection === undefined && kept.length === state.copies.length
        ? {}
        : { selection: moved.selection ?? state.selection, copies: kept };
    const view = { ...moved, ...chosen };
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

  /** Nothing was written: the frame takes back its previews and the nodes a drop moved. */
  function notTaken(): void {
    bridge.send({ type: 'drop-back' });
    bridge.send({ type: 'unpreview' });
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
      return change ? [sent.item === undefined ? change : { ...change, item: sent.item }] : [];
    });
    if (changes.length > 0) bridge.send({ type: 'preview', changes });
    const { edit, etags } = store.get();
    const request: EditRequest | null = edit
      ? { version: edit.version, ops: sent.ops, etags, ...(force ? { force } : {}) }
      : null;
    const answer = request ? await io.post(slug, request) : null;
    if (!answer?.ok) {
      // Nothing was saved: the stacks stay, and the person is told (no answer, or an error).
      notTaken();
      store.set({ busy: false, failed: { kind, gesture: sent, status: answer?.status ?? 0 } });
      return null;
    }
    const outcome = answer.body;
    if (outcome.outcome === 'applied') {
      pending = null;
      finish(kind, sent, original, outcome);
      const note = appliedNote(store.get().applied, sent.ops, outcome);
      store.set({ busy: false, applied: note, failed: null });
      // An undo, a redo or a change a button made: the ring shows where it landed. An edit by
      // the person's own hand on the element needs none.
      if (kind !== 'apply' || original.flash) bridge.flash?.(note.ids);
      if (outcome.started) void learnSession(outcome.version);
    } else if (outcome.outcome === 'conflict') {
      notTaken();
      store.set({ busy: false, conflict: { gesture: sent, outcome }, failed: null });
    } else {
      pending = null;
      notTaken();
      const [first] = outcome.refusals;
      store.set({
        busy: false,
        refused: first ? { gesture: sent, index: first.index, reason: first.reason } : null,
        failed: null,
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
