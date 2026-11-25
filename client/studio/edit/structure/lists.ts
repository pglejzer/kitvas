// Data list items on the draft page (spec 4c, goal 9; plan 16, task D; ADR 0065). A list item is
// the root element its list's callback returns, on the copy the person chose: Move up, Move down,
// Duplicate and Delete act on that item of the data, at any depth, by the copy's path. Several
// chosen copies of one list are deleted together. A part of an item is an element of the template
// (`list-parts.ts`) and takes the element actions. The inline edit of an item's text and the note
// above the properties are here too. A list over anything but a literal array of the file is
// read-only: its actions go to the server, which refuses them with the reason, and the Ask Claude
// box offers to make the change. The rules are pure over the store's state; `mountLists` wires
// them.

import type { EditOp, Refusal } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { type CopyRef, textEditOf } from '../../../channel/edit-protocol.ts';
import type { EditorContext } from '../context.ts';
import { chosenCopy, copiesOf } from '../select/copies.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import type { ActionId, ActionReason } from './actions.ts';
import { itemOfPart, partNote, partTarget } from './list-parts.ts';

/** What a list maps over (`InspectSchema.list.kind`). */
export type ListKind = NonNullable<Inspect['list']>['kind'];

/**
 * The inspect's `list`. `texts`: the string each item shows as the element's text
 * (`setItemText` sends the one the person saw as its `before`). `root`: the element is the list's
 * item, not a part of one. `copy`, `copies`: asked with a copy's path, that item's place among
 * all the copies the list renders, and how many its arrays hold.
 */
export type ListView = {
  kind: ListKind;
  count: number | null;
  reason: Refusal | null;
  texts?: readonly (string | null)[] | null | undefined;
  root?: boolean | undefined;
  copy?: number | null | undefined;
  copies?: number | null | undefined;
};

/** The selection as an item of a list. */
export type ItemTarget = {
  id: string;
  list: ListView;
  /** The chosen copy's place in its own list; `null` while none was chosen among several. */
  item: number | null;
  /** The chosen copy's path, as the frame gave it; `null` when it gave none. */
  path: number[] | null;
  /** The chosen copy's place among all the copies of the id; `null` when the frame gave none. */
  copy: number | null;
  /** The items of the list the copy stands in: the array's, else the copies the frame renders. */
  count: number;
  /** The frame renders more or fewer copies than the arrays have items: none can be told apart. */
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

type View = Pick<EditorState, 'selection' | 'copies' | 'inspected' | 'tree' | 'item'>;

/** The inspect's `list`, with `texts` when it carries them. */
export function listOf(inspected: Inspect | null): ListView | null {
  const list: ListView | null | undefined = inspected?.list;
  return list ?? null;
}

/** The list around the one selected element, as its source view reads it. */
function selectedList(state: View): { id: string; list: ListView } | null {
  const id = state.selection[0];
  if (id === undefined || state.selection.length !== 1) return null;
  const list = listOf(state.inspected?.id === id ? state.inspected : null);
  return list === null ? null : { id, list };
}

/** The same, when the element is the list's item and not a part of one. */
function rootList(state: View): { id: string; list: ListView } | null {
  const found = selectedList(state);
  return found === null || found.list.root === false ? null : found;
}

const treeCount = (state: View, id: string): number | null =>
  state.tree.find((node) => node.id === id)?.count ?? null;

/**
 * The copy of the selected element as a place in its list: the item it is, or the item a part
 * stands in (the lists around a part are its item's, so the path is the same).
 */
function targetOf(state: View, found: { id: string; list: ListView }): ItemTarget {
  const { id, list } = found;
  const chosen = chosenCopy(state.selection, state.copies);
  const path = chosen?.path ?? null;
  const rendered = treeCount(state, id);
  const count = list.count ?? rendered ?? 0;
  // All the copies the arrays hold: the inspect counts them for a path, else the one list's own.
  const held = list.copies ?? ((path?.length ?? 1) > 1 ? null : list.count);
  const mismatch =
    list.kind === 'literal' && rendered !== null && held !== null && rendered !== held;
  // A path names the item in its own list. Without one the copy's place is the item, in a list
  // inside no other list; one copy needs no pick.
  const own = path === null ? (state.item ?? (count === 1 ? 0 : null)) : (path.at(-1) ?? null);
  const item = own !== null && own < count ? own : null;
  return { id, list, item, path, copy: chosen?.item ?? null, count, mismatch };
}

/** The one selected element as an item of a list; `null` for anything else, a part of one too. */
export function itemTarget(state: View): ItemTarget | null {
  const found = rootList(state);
  return found === null ? null : targetOf(state, found);
}

/** Several chosen copies of one list item: what Delete removes together. */
export function chosenItems(state: View): { id: string; copies: CopyRef[] } | null {
  const found = rootList(state);
  if (found === null) return null;
  const copies = copiesOf(state.copies, found.id);
  return copies.length > 1 ? { id: found.id, copies } : null;
}

/** Later places first: by the path, place by place, else by the place among the copies. */
function later(a: CopyRef, b: CopyRef): number {
  const left = a.path ?? [a.item ?? 0];
  const right = b.path ?? [b.item ?? 0];
  for (let depth = 0; depth < Math.max(left.length, right.length); depth += 1) {
    const step = (right[depth] ?? -1) - (left[depth] ?? -1);
    if (step !== 0) return step;
  }
  return 0;
}

/**
 * One `removeItem` for each chosen copy, the last place of each list first, so every op finds its
 * item where the one before left it. `null` when a copy does not say which item it is.
 */
export function removeOps(id: string, copies: readonly CopyRef[]): EditOp[] | null {
  const ops: EditOp[] = [];
  for (const copy of [...copies].sort(later)) {
    const item = copy.path === undefined ? copy.item : copy.path.at(-1);
    if (item === undefined) return null;
    const path = copy.path === undefined ? {} : { path: [...copy.path] };
    ops.push({ op: 'removeItem', id, item, ...path });
  }
  return ops;
}

/**
 * Why a list action is off (`ActionReason`), `null` when it is on, `undefined` when the
 * selection is no list item and the element actions' own rules apply.
 */
export function listReason(state: View, action: ActionId): ActionReason | null | undefined {
  if (!LIST_ACTIONS.has(action)) return undefined;
  const many = chosenItems(state);
  const target = itemTarget(state);
  if (many !== null) {
    if (action !== 'delete') return 'one-only';
    // The copies cannot be told apart: a place among them names no item of the data.
    if (target?.mismatch === true) return 'list-not-literal';
    return removeOps(many.id, many.copies) === null ? 'pick-item' : null;
  }
  if (target === null) return undefined;
  if (target.mismatch) return 'list-not-literal';
  if (target.item === null) return 'pick-item';
  if (action === 'move-up' && target.item === 0) return 'at-edge';
  if (action === 'move-down' && target.item >= target.count - 1) return 'at-edge';
  return null;
}

/**
 * The ops of a list action, and by how many places the chosen copy moves (`null`: it is gone).
 * The copy's path goes with the op when the frame gave one: the server then acts on the array
 * that copy's item stands in.
 */
export function listOps(
  target: ItemTarget,
  action: ActionId,
): { ops: EditOp[]; shift: number | null } | null {
  const { id, item, count } = target;
  if (item === null) return null;
  const path = target.path === null ? {} : { path: [...target.path] };
  switch (action) {
    case 'move-up':
      return item > 0
        ? { ops: [{ op: 'moveItem', id, item, to: item - 1, ...path }], shift: -1 }
        : null;
    case 'move-down':
      return item < count - 1
        ? { ops: [{ op: 'moveItem', id, item, to: item + 1, ...path }], shift: 1 }
        : null;
    case 'duplicate':
      return { ops: [{ op: 'duplicateItem', id, item, ...path }], shift: 1 };
    case 'delete':
      return { ops: [{ op: 'removeItem', id, item, ...path }], shift: null };
    default:
      return null;
  }
}

/** The chosen copy `shift` places further in its own list. */
export function shifted(target: ItemTarget, shift: number): CopyRef {
  const path = target.path?.map((place, depth, all) =>
    depth === all.length - 1 ? place + shift : place,
  );
  return {
    id: target.id,
    ...(target.copy === null ? {} : { item: target.copy + shift }),
    ...(path === undefined ? {} : { path }),
  };
}

/**
 * Runs `action` on the selected list item, or Delete on several chosen items; `false` when the
 * selection is no list item, so the element action runs instead. The moved or copied item stays
 * the chosen one; a deleted one leaves the selection.
 */
export async function runListAction(ctx: EditorContext, action: ActionId): Promise<boolean> {
  if (!LIST_ACTIONS.has(action)) return false;
  const { store, history } = ctx;
  const state = store.get();
  const many = chosenItems(state);
  const target = many === null ? itemTarget(state) : null;
  if (many === null && target === null) return false;
  // Several items take Delete only.
  if (many !== null && action !== 'delete') return true;
  const made =
    many !== null
      ? { ops: removeOps(many.id, many.copies) ?? [], shift: null }
      : target === null
        ? null
        : listOps(target, action);
  if (made === null || made.ops.length === 0) return true;
  const id = many?.id ?? target?.id ?? '';
  const label =
    many === null
      ? text(`lists.label.${action}`)
      : text('lists.label.deleteMany', { count: made.ops.length });
  const outcome = await history.apply({ ops: made.ops, label });
  const after = store.get();
  if (outcome?.outcome !== 'applied' || after.selection[0] !== id) return true;
  if (made.shift === null) {
    // What is left of the list is not chosen: the element itself would be every other item.
    store.set({ selection: after.selection.filter((one) => one !== id) });
  } else if (target !== null) {
    store.set({ selection: after.selection, copies: [shifted(target, made.shift)] });
  }
  return true;
}

/**
 * The item's text the inline editor may write: a string literal field of the picked item. The
 * text of a part is its item's data too, so a part's text is written the same way.
 */
export function textTarget(state: View): TextTarget | null {
  const found = selectedList(state);
  const target = found === null ? null : targetOf(state, found);
  if (target === null || target.item === null || target.mismatch) return null;
  // A plain text child is the element's own (`setText`), never an item's.
  if (target.list.kind !== 'literal' || state.inspected?.text !== null) return null;
  const before = target.list.texts?.[target.item];
  return typeof before === 'string' ? { id: target.id, item: target.item, before } : null;
}

/** A JSX `key` read from one field of the item (`item.id`); a copy keeps it (spec 4d, goal 8). */
const FIELD_KEY = /^[A-Za-z_$][\w$]*\??\.([A-Za-z_$][\w$]*)$/;

/**
 * The field the element's `key` reads, when Duplicate leaves it as it is: kitvas makes a literal
 * `key` field of the item unique in the copy, never another one. `null` for anything else.
 */
export function keyFieldOf(inspected: Pick<Inspect, 'props'> | null): string | null {
  const key = inspected?.props.find((prop) => prop.name === 'key');
  if (key?.kind !== 'expr') return null;
  const field = FIELD_KEY.exec(key.source.trim())?.[1];
  return field === undefined || field === 'key' ? null : field;
}

/**
 * The note above the properties: which item of how many, or why the list is read-only.
 * `keyField`: the item's field the list's `key` reads, which a copy keeps (`keyFieldOf`).
 * `many`: how many items are chosen together, when more than one.
 */
export function noteText(
  target: ItemTarget | null,
  keyField: string | null = null,
  many = 0,
): string | null {
  if (target === null) return null;
  const { list, item, count } = target;
  if (list.kind !== 'literal') return text(`lists.note.${list.kind}`);
  if (target.mismatch) return text('lists.note.mismatch');
  if (many > 1) return text('lists.note.many', { count: many });
  if (item === null) return text('lists.note.pick', { count });
  const line = text('lists.note.item', { item: item + 1, count });
  return keyField === null ? line : `${line} ${text('lists.note.keyField', { field: keyField })}`;
}

export function mountLists(ctx: EditorContext): void {
  const { store, bridge, history } = ctx;
  /** A double click on an item waits here for the item's source view. */
  let pendingText: string | null = null;
  /** The inline edit of an item's text that the frame has open. */
  let editing: TextTarget | null = null;

  const note = document.createElement('p');
  note.className = 'k-meta list-note';
  note.dataset.edit = 'list';
  note.dataset.off = '';
  // Beside the properties, never inside them: their panel draws its own section again. It takes
  // the pane's name, so the screen shows and hides it with the Properties tab; `data-off` is its
  // own state, as the live blocks have theirs.
  const props = ctx.panel.querySelector<HTMLElement>('section[data-edit="props"]');
  if (props) {
    if (props.dataset.pane !== undefined) note.dataset.pane = props.dataset.pane;
    note.hidden = props.hidden;
    props.before(note);
  } else {
    ctx.panel.append(note);
  }

  /** The control of a part's note: it selects the item the part belongs to, on the same copy. */
  function itemButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'k-btn k-btn-line';
    button.dataset.listItem = '';
    button.textContent = text('lists.note.selectItem');
    button.addEventListener('click', () => {
      const next = itemOfPart(store.get());
      if (next !== null) store.set(next);
    });
    return button;
  }

  function render(state: EditorState): void {
    const part = state.on ? partTarget(state) : null;
    const many = chosenItems(state)?.copies.length ?? 0;
    const line = !state.on
      ? null
      : part !== null
        ? partNote(part)
        : noteText(itemTarget(state), keyFieldOf(state.inspected), many);
    note.toggleAttribute('data-off', line === null);
    note.replaceChildren(line ?? '');
    if (part !== null && part.root !== null) note.append(' ', itemButton());
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
    // A write that did not happen takes the typed text back out of the frame.
    void history.apply({ ops: [op], label: text('lists.label.text') }).then((outcome) => {
      if (outcome?.outcome !== 'applied') bridge.send({ type: 'text-back', id });
    });
  }

  bridge.on((message) => {
    if (!store.get().on) return;
    if (message.type === 'pick') {
      // The selection panel has taken the pick with its copy already (`select/mode.ts`).
      // A double click with Shift, Ctrl or Cmd held starts no text edit.
      pendingText = textEditOf(message);
      tryText();
    } else if (message.type === 'text') {
      onText(message.id, message.value);
    }
  });

  store.subscribe((state, previous) => {
    if (state.selection[0] !== previous.selection[0]) pendingText = null;
    if (state.inspected !== previous.inspected) tryText();
    const shown =
      state.on !== previous.on ||
      state.selection !== previous.selection ||
      state.copies !== previous.copies ||
      state.inspected !== previous.inspected ||
      state.structure !== previous.structure ||
      state.tree !== previous.tree;
    if (shown) render(state);
  });
  render(store.get());
}
