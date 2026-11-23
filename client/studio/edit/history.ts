// Undo and redo of the person's own edits, and the one path edits are sent by (plan 13, task H).
// Undo sends the inverse ops of a gesture to the current text through the same API: never a
// snapshot, so a change Claude made elsewhere in the file survives an undo.

import type { EditOp } from '../../../src/edit/index.ts';
import type { EditOutcome, EditRequest } from '../../../src/studio/api/edit-schemas.ts';
import { type Answer, postEdits } from './api.ts';
import type { History, HistoryDeps } from './context.ts';
import { previewOf } from './preview-of.ts';
import type { ChangeEntry, Gesture } from './store.ts';
import { text } from './texts.ts';

/** Two edits of one property this close together are one undo step (R13): a stepper drag. */
export const GROUP_MS = 800;

/** The ports the history uses, replaceable in tests. */
export type HistoryIo = {
  post(slug: string, request: EditRequest): Promise<Answer<EditOutcome>>;
  now(): number;
};

const realIo: HistoryIo = { post: postEdits, now: () => Date.now() };

/**
 * The operation that undoes `op`. The same rules as `inverse` in `src/edit/domain/ops.ts`; the
 * client may not import values from `src/`, and a test keeps the two in step.
 */
export function inverse(op: EditOp): EditOp {
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
export const inverseAll = (ops: readonly EditOp[]): EditOp[] => [...ops].reverse().map(inverse);

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

/** `next` folded into `top` when it is one more step of the same change, else `null`. */
export function mergeGestures(top: Gesture, next: Gesture): Gesture | null {
  const [only] = next.ops;
  const last = top.ops[top.ops.length - 1];
  if (next.ops.length !== 1 || !only || !last) return null;
  const key = groupKey(only);
  if (key === null || key !== groupKey(last)) return null;
  return { ops: [...top.ops.slice(0, -1), joinOps(last, only)], label: next.label };
}

const isOffKit = (ops: readonly EditOp[]): boolean =>
  ops.some((op) => op.op === 'setStyle' && 'raw' in op.value);

type Kind = 'apply' | 'undo' | 'redo';
/** What a conflict was about, so "keep mine" and "keep theirs" can finish the right stack. */
type Pending = { kind: Kind; original: Gesture };

export function createHistory(deps: HistoryDeps, io: HistoryIo = realIo): History {
  const { store, bridge, slug } = deps;
  let tail: Promise<unknown> = Promise.resolve();
  let pending: Pending | null = null;
  /** The last gesture that was applied by `apply`, and when; the one a new step may join. */
  let last: { gesture: Gesture; at: number } | null = null;

  // One request at a time: a call made while one runs waits for it.
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = tail.then(job, job);
    tail = next.catch(() => undefined);
    return next;
  }

  const entry = (gesture: Gesture, label: string): ChangeEntry => ({
    by: 'person',
    id: gesture.ops[0]?.id ?? null,
    label,
    files: [],
    offKit: isOffKit(gesture.ops),
    at: io.now(),
  });

  function finish(kind: Kind, sent: Gesture, original: Gesture, outcome: EditOutcome): void {
    const state = store.get();
    const same = (item: Gesture): boolean => item !== original;
    const label = kind === 'apply' ? sent.label : text(`history.${kind}`, { label: sent.label });
    const etags = { ...state.etags, ...(outcome.outcome === 'applied' ? outcome.etags : {}) };
    const edit =
      outcome.outcome === 'applied' && state.edit
        ? {
            ...state.edit,
            version: outcome.version,
            session: outcome.started
              ? { version: outcome.version, startedAt: new Date(io.now()).toISOString() }
              : state.edit.session,
          }
        : state.edit;
    if (kind === 'apply') {
      const top = state.undo[state.undo.length - 1];
      const merged =
        top && last && last.gesture === top && io.now() - last.at < GROUP_MS
          ? mergeGestures(top, sent)
          : null;
      const gesture = merged ?? sent;
      const undo = merged ? [...state.undo.slice(0, -1), merged] : [...state.undo, sent];
      const changes = merged
        ? [...state.changes.slice(0, -1), entry(gesture, merged.label)]
        : [...state.changes, entry(sent, label)];
      last = { gesture, at: io.now() };
      store.set({ etags, edit, undo, redo: [], changes });
      return;
    }
    last = null;
    const changes = [...state.changes, entry(sent, label)];
    if (kind === 'undo') {
      store.set({
        etags,
        edit,
        changes,
        undo: state.undo.filter(same),
        redo: [...state.redo, original],
      });
    } else {
      store.set({
        etags,
        edit,
        changes,
        redo: state.redo.filter(same),
        undo: [...state.undo, original],
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
    if (!answer || !answer.ok) {
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

  return {
    apply: (gesture) => enqueue(() => submit('apply', gesture, gesture, false)),
    undo: () =>
      enqueue(async () => {
        const top = store.get().undo[store.get().undo.length - 1];
        if (!top) return;
        await submit('undo', { ops: inverseAll(top.ops), label: top.label }, top, false);
      }),
    redo: () =>
      enqueue(async () => {
        const top = store.get().redo[store.get().redo.length - 1];
        if (top) await submit('redo', top, top, false);
      }),
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
      const drop = (stack: Gesture[]): Gesture[] => stack.filter((item) => item !== original);
      store.set({
        etags: { ...etags, [conflict.outcome.file]: conflict.outcome.etag },
        conflict: null,
        undo: pending?.kind === 'undo' ? drop(undo) : undo,
        redo: pending?.kind === 'redo' ? drop(redo) : redo,
      });
      pending = null;
      last = null;
    },
  };
}
