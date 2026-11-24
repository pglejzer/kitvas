// Data list items on the draft page (spec 4c, goal 9; plan 16, task D): which rendered copy of the
// selected element the person picked, what Move up, Move down, Duplicate and Delete do with it
// (they act on that item of the data), the inline edit of an item's text, and a note that says
// what kind of list it is. A list over anything but a literal array of the file is read-only: its
// actions go to the server, which refuses them with the reason, and the Ask Claude box offers to
// make the change. The rules are pure over the store's state; `mountLists` wires them.

import type { EditOp, Refusal } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { EditStudioBody } from '../../../channel/edit-protocol.ts';
import type { EditorContext } from '../context.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import type { ActionId, ActionReason } from './actions.ts';

/** What a list maps over (`InspectSchema.list.kind`). */
export type ListKind = NonNullable<Inspect['list']>['kind'];

/**
 * The inspect's `list`. `texts`: the string each item shows as the element's text, when the
 * inspect sends them (`itemTexts` of `src/edit/domain/list/edit.ts`); `setItemText` sends the one
 * the person saw as its `before`.
 */
export type ListView = {
  kind: ListKind;
  count: number | null;
  reason: Refusal | null;
  texts?: readonly (string | null)[] | null | undefined;
};

/** The selection as an item of a list. */
export type ItemTarget = {
  id: string;
  list: ListView;
  /** The picked copy; `null` while none was picked among several. */
  item: number | null;
  /** The items: the literal array's, else the copies the frame renders. */
  count: number;
  /** The frame renders more or fewer copies than the array has items: none can be told apart. */
  mismatch: boolean;
};

/** An inline edit of an item's text: the item and the string it showed. */
export type TextTarget = { id: string; item: number; before: string };

/** The actions that act on the item of the data when the selection is a list item. */
export const LIST_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  'move-up',
  'move-down',
  'duplicate',
  'delete',
]);

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/** The inspect's `list`, with `texts` when it carries them. */
export function listOf(inspected: Inspect | null): ListView | null {
  const list: ListView | null | undefined = inspected?.list;
  return list ?? null;
}

/** The one selected element as an item of a list; `null` for anything else. */
export function itemTarget(state: EditorState): ItemTarget | null {
  const id = state.selection[0];
  if (id === undefined || state.selection.length !== 1) return null;
  const list = listOf(state.inspected?.id === id ? state.inspected : null);
  if (list === null) return null;
  const copies = state.tree.find((node) => node.id === id)?.count ?? null;
  const count = list.count ?? copies ?? 0;
  const mismatch = list.kind === 'literal' && copies !== null && copies !== list.count;
  // One copy needs no pick: the frame names a copy only when several carry the id.
  const item = state.item ?? (count === 1 ? 0 : null);
  return { id, list, item: item !== null && item < count ? item : null, count, mismatch };
}

/** The copy a pick chose: only a plain pick of the one selected element names one. */
export function pickedItem(
  selection: readonly string[],
  pick: { id: string | null; add: boolean; item?: number },
): number | null {
  if (pick.id === null || pick.add || selection.length !== 1 || selection[0] !== pick.id) {
    return null;
  }
  return pick.item ?? null;
}

/** The `select` message for the selection, with the picked copy when there is one. */
export function selectBody(state: EditorState): EditStudioBody {
  const ids = [...state.selection];
  const { item } = state;
  return item !== null && ids.length === 1
    ? { type: 'select', ids, item }
    : { type: 'select', ids };
}

/**
 * Why a list action is off (`ActionReason`), `null` when it is on, `undefined` when the
 * selection is no list item and the element actions' own rules apply.
 */
export function listReason(state: EditorState, action: ActionId): ActionReason | null | undefined {
  if (!LIST_ACTIONS.has(action)) return undefined;
  const target = itemTarget(state);
  if (target === null) return undefined;
  if (target.mismatch) return 'list-not-literal';
  if (target.item === null) return 'pick-item';
  if (action === 'move-up' && target.item === 0) return 'at-edge';
  if (action === 'move-down' && target.item >= target.count - 1) return 'at-edge';
  return null;
}

/** The ops of a list action, and the copy that is the moved or new item afterwards. */
export function listOps(
  target: ItemTarget,
  action: ActionId,
): { ops: EditOp[]; item: number | null } | null {
  const { id, item, count } = target;
  if (item === null) return null;
  switch (action) {
    case 'move-up':
      return item > 0
        ? { ops: [{ op: 'moveItem', id, item, to: item - 1 }], item: item - 1 }
        : null;
    case 'move-down':
      return item < count - 1
        ? { ops: [{ op: 'moveItem', id, item, to: item + 1 }], item: item + 1 }
        : null;
    case 'duplicate':
      return { ops: [{ op: 'duplicateItem', id, item }], item: item + 1 };
    case 'delete':
      return { ops: [{ op: 'removeItem', id, item }], item: null };
    default:
      return null;
  }
}

/**
 * Runs `action` on the selected list item; `false` when the selection is no list item, so the
 * element action runs instead. The moved or copied item stays the picked one.
 */
export async function runListAction(ctx: EditorContext, action: ActionId): Promise<boolean> {
  const target = itemTarget(ctx.store.get());
  if (target === null || !LIST_ACTIONS.has(action)) return false;
  const made = listOps(target, action);
  if (made === null) return true;
  const outcome = await ctx.history.apply({ ops: made.ops, label: text(`lists.label.${action}`) });
  if (outcome?.outcome === 'applied' && ctx.store.get().selection[0] === target.id) {
    ctx.store.set({ item: made.item });
  }
  return true;
}

/** The item's text the inline editor may write: a string literal field of the picked item. */
export function textTarget(state: EditorState): TextTarget | null {
  const target = itemTarget(state);
  if (target === null || target.item === null || target.mismatch) return null;
  // A plain text child is the element's own (`setText`), never an item's.
  if (target.list.kind !== 'literal' || state.inspected?.text !== null) return null;
  const before = target.list.texts?.[target.item];
  return typeof before === 'string' ? { id: target.id, item: target.item, before } : null;
}

/** The note above the properties: which item of how many, or why the list is read-only. */
export function noteText(target: ItemTarget | null): string | null {
  if (target === null) return null;
  const { list, item, count } = target;
  if (list.kind !== 'literal') return text(`lists.note.${list.kind}`);
  if (target.mismatch) return text('lists.note.mismatch');
  if (item === null) return text('lists.note.pick', { count });
  return text('lists.note.item', { item: item + 1, count });
}

export function mountLists(ctx: EditorContext): void {
  const { store, bridge, history } = ctx;
  /** A double click on an item waits here for the item's source view. */
  let pendingText: string | null = null;
  /** The inline edit of an item's text that the frame has open. */
  let editing: TextTarget | null = null;

  const note = document.createElement('p');
  note.className = 'edit-list';
  note.dataset.edit = 'list';
  note.hidden = true;
  // Beside the properties, never inside them: their panel draws its own section again.
  const props = ctx.panel.querySelector('section[data-edit="props"]');
  if (props) props.before(note);
  else ctx.panel.append(note);

  function select(state: EditorState): void {
    if (state.on && state.selection.length > 0) bridge.send(selectBody(state));
  }

  function render(state: EditorState): void {
    const line = state.on ? noteText(itemTarget(state)) : null;
    note.hidden = line === null;
    note.textContent = line ?? '';
  }

  function tryText(): void {
    if (pendingText === null) return;
    const target = textTarget(store.get());
    if (target === null || target.id !== pendingText) return;
    pendingText = null;
    editing = target;
    bridge.send({ type: 'edit-text', id: target.id });
  }

  function onText(id: string, value: string | null): void {
    const open = editing;
    if (open === null || open.id !== id) return;
    editing = null;
    if (value === null || value === open.before) return;
    const op: EditOp = { op: 'setItemText', id, item: open.item, value, before: open.before };
    void history.apply({ ops: [op], label: text('lists.label.text') });
  }

  bridge.on((message) => {
    if (!store.get().on) return;
    if (message.type === 'pick') {
      // The selection panel has taken the pick already; this says which copy it was.
      const item = pickedItem(store.get().selection, message);
      if (item !== store.get().item) store.set({ item });
      pendingText = message.double && message.id !== null ? message.id : null;
      tryText();
    } else if (message.type === 'text') {
      onText(message.id, message.value);
    } else if (message.type === 'tree' && store.get().item !== null) {
      // A frame that loaded again was told the selection without its copy: say it once more.
      select(store.get());
    }
  });

  store.subscribe((state, previous) => {
    if (!sameIds(state.selection, previous.selection)) {
      pendingText = null;
      if (state.item !== null) {
        // Another element, chosen in the layers or by a key: no copy of it is picked yet.
        store.set({ item: null });
        return;
      }
    }
    if (state.item !== previous.item) select(state);
    if (state.inspected !== previous.inspected) tryText();
    const shown =
      state.on !== previous.on ||
      state.selection !== previous.selection ||
      state.inspected !== previous.inspected ||
      state.item !== previous.item ||
      state.tree !== previous.tree;
    if (shown) render(state);
  });
  render(store.get());
}
