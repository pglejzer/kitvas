// A double click on a text the source writes as `{…}` (ADR 0060). The frame says where the
// picked copy stands in the lists around the element and what it shows (`locate-copy`), the server
// says whether one string literal of the file renders that text (`text-source`), and only then
// the frame opens the inline editor. The typed text goes out as a `setItemText` with the copy's
// path. A text without such a literal is refused at once, with the reason, in the panel's refusal
// place and its Ask Claude button; a write the server refuses puts the old text back in the frame.
// A copy that shows elements (a container) opens nothing. The rules are pure; `createSourceText`
// is the flow `mode.ts` runs.

import type { EditOp, Refusal } from '../../../../src/edit/index.ts';
import type { EditFrameMessage } from '../../../channel/edit-protocol.ts';
import { getTextSource } from '../api.ts';
import type { EditorContext } from '../context.ts';
import type { EditorState, Gesture } from '../store.ts';
import { textTarget } from '../structure/lists.ts';
import { text } from '../texts.ts';

/**
 * What a double click on the element edits: its plain text (`setText`), a literal list item's
 * field as before ADR 0060 (`lists.ts` opens it), a text through its source, or nothing.
 */
export type DoubleKind = 'text' | 'item' | 'source' | 'none';

/** An inline edit of a text through its source: the element, its copy, the path, what it showed. */
export type SourceTarget = { id: string; item: number | null; path: number[]; before: string };

type Located = Extract<EditFrameMessage, { type: 'copy-located' }>;
type Ended = Extract<EditFrameMessage, { type: 'text' }>;

/** What a double click on `id`, copy `item` (`null`: no copy named), edits. */
export function doubleKind(state: EditorState, id: string, item: number | null): DoubleKind {
  const { inspected } = state;
  if (inspected?.id !== id) return 'none';
  if (inspected.text !== null) return 'text';
  if (textTarget({ ...state, item }) !== null) return 'item';
  return inspected.expression ? 'source' : 'none';
}

/** The op that writes `value` where the copy showed `before`. */
export function sourceOp(target: SourceTarget, value: string, before = target.before): EditOp {
  const { id, path } = target;
  return { op: 'setItemText', id, item: path.at(-1) ?? 0, path: [...path], value, before };
}

/** The change list's label: an item's text inside a list, else the element's text. */
export const sourceLabel = (target: SourceTarget): string =>
  target.path.length > 0 ? text('lists.label.text') : text('label.text');

/** What the frame's answer leads to: ask the server, nothing, or a refusal at once. */
export type LocatedStep = 'ask' | 'none' | { refused: Refusal };

/**
 * A copy that shows elements opens nothing: a double click on a container is no text edit. A
 * list root the frame cannot find around the copy leaves it without its path (`not-found`).
 */
export function locatedStep(located: Pick<Located, 'path' | 'text'>): LocatedStep {
  if (located.text === null) return 'none';
  return located.path === null ? { refused: 'not-found' } : 'ask';
}

/** The flow `mode.ts` runs on a double click whose kind is `source`. */
export type SourceText = { open(id: string, item: number | null): void };

export function createSourceText(ctx: EditorContext): SourceText {
  const { store, bridge, history } = ctx;
  /** The `locate-copy` the page waits for. */
  let asked: { request: number; id: string; item: number | null } | null = null;
  /** The inline edit the frame has open. */
  let editing: SourceTarget | null = null;

  const stillOn = (id: string): boolean => {
    const state = store.get();
    return state.on && state.selection[0] === id;
  };

  /** Told in the panel's refusal place, where Ask Claude takes it. */
  function refuse(target: SourceTarget, reason: Refusal): void {
    const gesture: Gesture = { ops: [sourceOp(target, target.before)], label: sourceLabel(target) };
    store.set({ refused: { gesture, index: 0, reason } });
  }

  async function check(target: SourceTarget): Promise<void> {
    const { id, before, path, item } = target;
    const answer = await getTextSource(store.get().slug, { id, text: before, path });
    if (!stillOn(id)) return;
    const reason = answer.ok ? answer.body.reason : 'not-found';
    if (reason !== null) {
      refuse(target, reason);
      return;
    }
    editing = target;
    bridge.send({ type: 'edit-text', id, ...(item === null ? {} : { item }) });
  }

  function onLocated(message: Located): void {
    const waited = asked;
    if (waited === null || message.request !== waited.request || message.id !== waited.id) return;
    asked = null;
    if (!stillOn(waited.id)) return;
    const { id, item } = waited;
    const target = { id, item, path: message.path ?? [], before: message.text ?? '' };
    const step = locatedStep(message);
    if (step === 'ask') void check(target);
    else if (step !== 'none') refuse(target, step.refused);
  }

  function onEnded(message: Ended): void {
    const open = editing;
    if (open === null || open.id !== message.id) return;
    editing = null;
    // The text the editor started from: the frame may have drawn the page again since it was read.
    const before = message.before ?? open.before;
    if (message.value === null || message.value === before) return;
    const gesture = { ops: [sourceOp(open, message.value, before)], label: sourceLabel(open) };
    void history.apply(gesture).then((outcome) => {
      if (outcome?.outcome !== 'applied') bridge.send({ type: 'text-back', id: open.id });
    });
  }

  bridge.on((message) => {
    if (message.type === 'copy-located') onLocated(message);
    else if (message.type === 'text') onEnded(message);
  });

  return {
    open(id, item) {
      // A list around it without a root to count by: the path stays empty, and the server reads
      // only the literals written in the element's own `{…}`.
      const roots = store.get().inspected?.expression?.roots ?? [];
      const request = bridge.nextRequest();
      asked = { request, id, item };
      editing = null;
      const copy = item === null ? {} : { item };
      bridge.send({ type: 'locate-copy', request, id, ...copy, roots: [...roots] });
    },
  };
}
