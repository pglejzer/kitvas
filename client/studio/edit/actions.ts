// Every element action of the editor (spec 4b, goals; plan 14, task D2): which are possible for the
// selection, and the ops or the store change each one makes. The menu and the keys call `runAction`.

import type {
  EditOp,
  PropValue,
  Refusal,
  StyleProperty,
  StyleValue,
} from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import type { StructureEntry } from '../../../src/studio/api/structure-schemas.ts';
import { getSubtree, inspect as readInspect } from './api.ts';
import { copyElements, copyLocation, pasteClip } from './clipboard.ts';
import type { EditorContext } from './context.ts';
import { opsForProp, opsForStyle } from './props-panel.ts';
import { PROPERTIES, styleValueOf } from './steps.ts';
import type { EditorState, Gesture } from './store.ts';
import { text } from './texts.ts';
import { toast } from './toast.ts';

export const ACTIONS = [
  'delete',
  'duplicate',
  'copy',
  'copy-location',
  'cut',
  'paste',
  'move-up',
  'move-down',
  'wrap-stack',
  'wrap-row',
  'wrap-grid',
  'wrap-card',
  'unwrap',
  'replace',
  'reset',
  'copy-style',
  'paste-style',
  'select-similar',
  'hide',
  'show-all',
  'lock',
  'unlock',
] as const;
export type ActionId = (typeof ACTIONS)[number];

/**
 * Why an action is off: a refusal the server would give, or one of the menu's own (nothing
 * selected, nothing to paste, one element only, already first or last).
 */
export type ActionReason = Refusal | 'no-selection' | 'no-clip' | 'one-only' | 'at-edge';

/** An action as the menu lists it: off with the reason, or on. */
export type ActionState = { id: ActionId; enabled: boolean; reason: ActionReason | null };

/** `replace` takes the kit component to put in the element's place. */
export type ActionExtra = { tag?: string };

/** A gesture that asks the history to select what it created (task D1 reads the flag). */
type Selecting = Gesture & { selectCreated?: boolean };

const WRAP_OPEN: Record<string, string> = {
  'wrap-stack': '<Stack>',
  'wrap-row': '<Stack direction="row">',
  'wrap-grid': '<Grid>',
  'wrap-card': '<Card>',
};

type Entries = { list: readonly StructureEntry[]; byId: Map<string, StructureEntry> };

function entriesOf(state: EditorState): Entries {
  const list = state.structure?.elements ?? [];
  return { list, byId: new Map(list.map((entry) => [entry.id, entry])) };
}

/** The selection in document order; ids the structure does not know keep their place at the end. */
function ordered(state: EditorState, entries: Entries): string[] {
  const index = new Map(entries.list.map((entry, at) => [entry.id, at]));
  const rank = (id: string): number => index.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...new Set(state.selection)].sort((a, b) => rank(a) - rank(b));
}

/** Drops ids that sit inside another selected element: removing or copying the outer one takes them. */
function topmost(ids: readonly string[], entries: Entries): string[] {
  const chosen = new Set(ids);
  const inside = (id: string): boolean => {
    for (let at = entries.byId.get(id)?.parent; at; at = entries.byId.get(at)?.parent) {
      if (chosen.has(at)) return true;
    }
    return false;
  };
  return ids.filter((id) => !inside(id));
}

/** The first refusal for moving, deleting or duplicating any of `ids`. */
function movableReason(ids: readonly string[], entries: Entries): Refusal | null {
  for (const id of ids) {
    const entry = entries.byId.get(id);
    if (!entry) return 'not-found';
    if (entry.movable !== null) return entry.movable;
  }
  return null;
}

/** `ids` are consecutive element children of one parent, in order. */
function siblingsReason(ids: readonly string[], entries: Entries): Refusal | null {
  const first = entries.byId.get(ids[0] ?? '');
  if (!first) return 'not-found';
  const siblings = entries.list.filter((entry) => entry.parent === first.parent);
  const at = siblings.findIndex((entry) => entry.id === first.id);
  const same = ids.every((id, step) => siblings[at + step]?.id === id);
  return same ? null : 'not-siblings';
}

/** The sibling before the first or after the last of `ids`; `undefined` at the edge. */
function neighbour(
  ids: readonly string[],
  entries: Entries,
  direction: 'up' | 'down',
): StructureEntry | undefined {
  const first = entries.byId.get(ids[0] ?? '');
  const last = entries.byId.get(ids.at(-1) ?? '');
  if (!first || !last) return undefined;
  const siblings = entries.list.filter((entry) => entry.parent === first.parent);
  const from = direction === 'up' ? siblings.indexOf(first) - 1 : siblings.indexOf(last) + 1;
  return siblings[from];
}

/** Copy style keeps the style rows a source holds a value for (rows are `PROPERTIES`). */
type StyleClip = (
  | { property: StyleProperty; kind: 'prop'; name: string; value: PropValue }
  | { property: StyleProperty; kind: 'style'; value: StyleValue }
)[];
let styleClip: StyleClip | null = null;

/** For tests: forget the kept style. */
export function forgetStyleClip(): void {
  styleClip = null;
}

function styleOf(inspected: Inspect): StyleClip {
  const out: StyleClip = [];
  for (const property of PROPERTIES) {
    const source = inspected.styles[property];
    if (source?.kind === 'prop') {
      const written = inspected.props.find((prop) => prop.name === source.prop);
      if (written?.kind === 'literal') {
        out.push({ property, kind: 'prop', name: source.prop, value: written.value });
      }
      continue;
    }
    const declaration = inspected.scss?.declarations.find((own) => own.property === property);
    if (declaration && source?.kind !== 'utility') {
      out.push({
        property,
        kind: 'style',
        value: styleValueOf(declaration.value, declaration.offKit),
      });
    }
  }
  return out;
}

/** The ops that write the kept style on `target`; the class and its rule are made once. */
function pasteOps(target: Inspect, kept: StyleClip, format: 'scss' | 'tailwind'): EditOp[] {
  const ops: EditOp[] = [];
  let classAdded = false;
  let ruleMade = false;
  for (const row of kept) {
    if (row.kind === 'prop') {
      if (target.styles[row.property]?.kind !== 'prop') continue;
      ops.push(...opsForProp(target, row.name, row.value));
      continue;
    }
    for (const op of opsForStyle(target, row.property, row.value, { format })) {
      if (op.op === 'addClass') {
        if (classAdded) continue;
        classAdded = true;
      }
      if (op.op === 'setStyle') {
        ops.push({ ...op, newRule: op.newRule && !ruleMade });
        ruleMade = ruleMade || op.newRule;
        continue;
      }
      ops.push(op);
    }
  }
  return ops;
}

function reasonOf(state: EditorState, id: ActionId, running: boolean): ActionReason | null {
  const entries = entriesOf(state);
  const ids = ordered(state, entries);
  if (id === 'show-all') return null;
  if (id === 'paste' && ids.length === 0) return state.clipboard || running ? null : 'no-clip';
  if (ids.length === 0) return 'no-selection';
  const single = ids.length === 1;
  const expression = (): Refusal | null =>
    ids.some((one) => entries.byId.get(one)?.movable === 'in-expression') ? 'in-expression' : null;
  switch (id) {
    case 'delete':
    case 'duplicate':
    case 'cut':
      return movableReason(topmost(ids, entries), entries);
    case 'copy':
    case 'copy-location':
    case 'select-similar':
    case 'hide':
      return null;
    // One of the two is offered: Lock while any selected element is free, else Unlock.
    case 'lock':
      return ids.every((one) => state.locked.includes(one)) ? 'no-selection' : null;
    case 'unlock':
      return ids.some((one) => state.locked.includes(one)) ? null : 'no-selection';
    case 'paste': {
      const last = entries.byId.get(ids.at(-1) ?? '');
      if (last?.movable === 'in-expression') return 'in-expression';
      return state.clipboard || running ? null : 'no-clip';
    }
    case 'move-up':
    case 'move-down': {
      const refused = movableReason(ids, entries) ?? siblingsReason(ids, entries);
      if (refused) return refused;
      const next = neighbour(ids, entries, id === 'move-up' ? 'up' : 'down');
      if (!next) return 'at-edge';
      return next.movable === 'in-expression' ? 'in-expression' : null;
    }
    case 'wrap-stack':
    case 'wrap-row':
    case 'wrap-grid':
    case 'wrap-card':
      return expression() ?? siblingsReason(ids, entries);
    case 'unwrap': {
      if (!single) return 'one-only';
      const hasElements = entries.list.some((entry) => entry.parent === ids[0]);
      return expression() ?? (hasElements ? null : 'no-element-children');
    }
    case 'replace':
      return single ? expression() : 'one-only';
    case 'reset':
      return single ? null : 'one-only';
    case 'copy-style':
      return single && state.inspected?.id === ids[0] ? null : single ? 'not-found' : 'one-only';
    case 'paste-style':
      return styleClip ? null : 'no-clip';
  }
}

export function actionsFor(state: EditorState): ActionState[] {
  return ACTIONS.map((id) => {
    const reason = reasonOf(state, id, false);
    return { id, enabled: reason === null, reason };
  });
}

/** Where new elements go: after the last selected one, inside a root, or last in the first section. */
function landing(
  entries: Entries,
  ids: readonly string[],
): { anchor: string; place: 'after' | 'last' } | null {
  const last = ids.at(-1);
  if (last) return { anchor: last, place: entries.byId.get(last)?.root ? 'last' : 'after' };
  const section = entries.list.find((entry) => entry.root === 'section');
  return section ? { anchor: section.id, place: 'last' } : null;
}

const label = (id: string, params: Record<string, string | number> = {}): string =>
  text(`actions.label.${id}`, params);

async function send(
  ctx: EditorContext,
  ops: EditOp[],
  name: string,
  created = false,
): Promise<void> {
  if (ops.length === 0) return;
  const gesture: Selecting = { ops, label: name, ...(created ? { selectCreated: true } : {}) };
  await ctx.history.apply(gesture);
}

async function duplicate(ctx: EditorContext, ids: readonly string[]): Promise<void> {
  const ops: EditOp[] = [];
  for (const id of ids) {
    const answer = await getSubtree(ctx.slug, id);
    if (!answer.ok) return;
    const { source, file } = answer.body;
    ops.push({ op: 'insertElement', anchor: id, place: 'after', source, from: file });
  }
  await send(ctx, ops, label('duplicate', { count: ids.length }), true);
}

async function paste(ctx: EditorContext, ids: readonly string[]): Promise<void> {
  const state = ctx.store.get();
  const clip = await pasteClip(ctx);
  const at = clip ? landing(entriesOf(state), ids) : null;
  if (!clip || !at) return;
  // After one anchor each insert lands next to it, so the last item goes first to keep the order.
  const items = at.place === 'after' ? [...clip.items].reverse() : clip.items;
  const ops = items.map(
    (item): EditOp => ({
      op: 'insertElement',
      anchor: at.anchor,
      place: at.place,
      source: item.source,
      ...(item.from === '' ? {} : { from: item.from }),
    }),
  );
  await send(ctx, ops, label('paste', { count: clip.items.length }), true);
}

async function pasteStyle(ctx: EditorContext, ids: readonly string[]): Promise<void> {
  const state = ctx.store.get();
  const kept = styleClip;
  if (!kept) return;
  const format = state.edit?.format ?? 'scss';
  const ops: EditOp[] = [];
  for (const id of ids) {
    const known = state.inspected?.id === id ? state.inspected : null;
    const target = known ?? (await readInspect(ctx.slug, id).then((a) => (a.ok ? a.body : null)));
    if (target) ops.push(...pasteOps(target, kept, format));
  }
  await send(ctx, ops, label('paste-style', { count: ids.length }));
}

function move(ids: readonly string[], entries: Entries, direction: 'up' | 'down'): EditOp[] {
  const next = neighbour(ids, entries, direction);
  if (!next) return [];
  // Each element goes beside the neighbour in turn; down reverses the order so they stay in order.
  const order = direction === 'up' ? ids : [...ids].reverse();
  return order.map(
    (id): EditOp => ({
      op: 'moveElement',
      id,
      anchor: next.id,
      place: direction === 'up' ? 'before' : 'after',
      ...hashOf(entries, id),
    }),
  );
}

function hashOf(entries: Entries, id: string): { hash?: string } {
  const hash = entries.byId.get(id)?.hash;
  return hash ? { hash } : {};
}

/** Does the action: a gesture through `ctx.history`, a clipboard step, or a store change. */
export async function runAction(
  ctx: EditorContext,
  id: ActionId,
  extra: ActionExtra = {},
): Promise<void> {
  const state = ctx.store.get();
  if (reasonOf(state, id, true) !== null) return;
  const entries = entriesOf(state);
  const ids = ordered(state, entries);
  const outer = topmost(ids, entries);
  const first = ids[0] ?? '';
  const remove = (list: readonly string[]): EditOp[] =>
    list.map((one): EditOp => ({ op: 'removeElement', id: one, ...hashOf(entries, one) }));
  switch (id) {
    case 'delete':
      return send(ctx, remove(outer), label('delete', { count: outer.length }));
    case 'duplicate':
      return duplicate(ctx, outer);
    case 'copy': {
      const clip = await copyElements(ctx, outer);
      toast(ctx.main, text(clip ? 'copy.done' : 'copy.failed'));
      return;
    }
    case 'copy-location': {
      const copied = await copyLocation(ctx, ids);
      toast(ctx.main, text(copied ? 'copy.locationDone' : 'copy.locationFailed'));
      return;
    }
    case 'cut': {
      if (await copyElements(ctx, outer)) {
        await send(ctx, remove(outer), label('cut', { count: outer.length }));
      }
      return;
    }
    case 'paste':
      return paste(ctx, ids);
    case 'move-up':
    case 'move-down':
      return send(ctx, move(ids, entries, id === 'move-up' ? 'up' : 'down'), label(id));
    case 'wrap-stack':
    case 'wrap-row':
    case 'wrap-grid':
    case 'wrap-card': {
      const open = WRAP_OPEN[id] ?? '<Stack>';
      const last = ids.at(-1) ?? first;
      // The server hashes the text from `first` to the end of `last`: one element's hash fits only
      // a single element.
      const seen = first === last ? hashOf(entries, first) : {};
      const op: EditOp = { op: 'wrapElements', first, last, open, ...seen };
      return send(ctx, [op], label(id), true);
    }
    case 'unwrap':
      return send(ctx, [{ op: 'unwrapElement', id: first, ...hashOf(entries, first) }], label(id));
    case 'replace': {
      if (!extra.tag) return;
      const op: EditOp = { op: 'replaceTag', id: first, tag: extra.tag, ...hashOf(entries, first) };
      return send(ctx, [op], label(id, { tag: extra.tag }));
    }
    case 'reset':
      return send(ctx, [{ op: 'resetElement', id: first, ...hashOf(entries, first) }], label(id));
    case 'copy-style':
      styleClip = state.inspected ? styleOf(state.inspected) : null;
      return;
    case 'paste-style':
      return pasteStyle(ctx, ids);
    case 'select-similar': {
      const tag = entries.byId.get(first)?.tag;
      const same = entries.list.filter((entry) => entry.tag === tag).map((entry) => entry.id);
      if (tag) ctx.store.set({ selection: same });
      return;
    }
    case 'hide': {
      const hidden = [...new Set([...state.hidden, ...ids])];
      ctx.store.set({ hidden });
      ctx.bridge.send({ type: 'hide', ids: hidden });
      return;
    }
    case 'show-all':
      ctx.store.set({ hidden: [] });
      ctx.bridge.send({ type: 'hide', ids: [] });
      return;
    case 'lock':
    case 'unlock': {
      const locked =
        id === 'lock'
          ? [...new Set([...state.locked, ...ids])]
          : state.locked.filter((one) => !ids.includes(one));
      ctx.store.set({ locked });
      ctx.bridge.send({ type: 'lock', ids: locked });
      return;
    }
  }
}
