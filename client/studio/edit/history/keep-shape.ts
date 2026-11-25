// The shape of a kept history (ADR 0061), checked by hand when it is read back: the page uses no
// stored value it did not check, and a list with one entry that does not fit is dropped whole. An
// op is checked by the fields of its kind as `EditOpSchema` has them (fields it does not list are
// kept as they are); an op of a kind this table does not know drops the list.
// `test/client/studio/edit/history/keep.test.ts` holds the table to every op kind.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Gesture } from '../store.ts';
import type { ChangeChip, StepEntry } from './chips.ts';

type Loose = Record<string, unknown>;
type Check = (value: unknown) => boolean;
type Fields = Readonly<Record<string, Check>>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text: Check = (value) => typeof value === 'string';
/** An element id: what `ElementIdSchema` takes, at its length. */
const id: Check = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const flag: Check = (value) => typeof value === 'boolean';
const index: Check = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const width: Check = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 1;
const orNull =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value);
const oneOf =
  (...words: string[]): Check =>
  (value) =>
    typeof value === 'string' && words.includes(value);
const shaped =
  (fields: Fields): Check =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([name, check]) => check(value[name]));

const propValue: Check = (value) => {
  if (!isObject(value)) return false;
  const held = value.value;
  if (value.kind === 'string') return typeof held === 'string';
  if (value.kind === 'number') return typeof held === 'number' && Number.isFinite(held);
  return value.kind === 'boolean' && typeof held === 'boolean';
};
const styleValue: Check = (value) => {
  if (!isObject(value)) return false;
  if (typeof value.token === 'string') return value.raw === undefined;
  return typeof value.raw === 'string' && (value.mark === undefined || value.mark === false);
};
const context = shaped({
  width: orNull(width),
  state: orNull(oneOf('hover', 'focus-visible', 'active')),
});
const place = oneOf('before', 'after', 'first', 'last');
/**
 * A copy's place in each list around it: at most `MAX_LIST_DEPTH` of the edit ops (ADR 0060 for
 * a text, ADR 0065 for an item).
 */
const path: Check = (value) => Array.isArray(value) && value.length <= 8 && value.every(index);
const hunks: Check = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(shaped({ find: text, replace: text }));
const seen = { hash: optional(text) };
const style = { id, className: text, property: text };

/** The fields of each op kind. */
export const OP_FIELDS: Readonly<Record<string, Fields>> = {
  setProp: { id, name: text, value: propValue, before: orNull(propValue), after: orNull(text) },
  removeProp: { id, name: text, before: propValue, after: orNull(text) },
  setText: { id, value: text, before: text },
  setStyle: {
    ...style,
    value: styleValue,
    before: orNull(styleValue),
    newRule: flag,
    context: optional(context),
    newBlock: optional(flag),
  },
  removeStyle: {
    ...style,
    before: styleValue,
    dropRule: flag,
    context: optional(context),
    dropBlock: optional(flag),
  },
  setUtility: { id, value: orNull(text), before: orNull(text) },
  addClass: { id, className: text },
  removeClass: { id, className: text },
  moveElement: { id, anchor: id, place, ...seen },
  insertElement: { anchor: id, place, source: text, from: optional(text) },
  removeElement: { id, ...seen },
  wrapElements: { first: id, last: id, open: text, ...seen },
  unwrapElement: { id, ...seen },
  replaceTag: { id, tag: text, ...seen },
  replaceElement: { id, source: text, ...seen },
  resetElement: { id, ...seen },
  moveSection: { section: text, after: orNull(text) },
  insertSection: { from: shaped({ slug: text, section: text }), after: orNull(text) },
  removeSection: { section: text },
  moveItem: { id, item: index, to: index, path: optional(path), toPath: optional(path) },
  duplicateItem: { id, item: index, path: optional(path) },
  removeItem: { id, item: index, path: optional(path) },
  setItemText: { id, item: index, value: text, before: text, path: optional(path) },
  addItemClass: { id, path, className: text },
  patch: { file: text, hunks },
  file: { file: text, text: orNull(text), before: orNull(text) },
};

/** An op of a kind the table knows, with every field of that kind as its schema has it. */
export function isOp(value: unknown): value is EditOp {
  if (!isObject(value) || typeof value.op !== 'string') return false;
  const fields = Object.hasOwn(OP_FIELDS, value.op) ? OP_FIELDS[value.op] : undefined;
  return (
    fields !== undefined && Object.entries(fields).every(([name, check]) => check(value[name]))
  );
}

/** A list of ops, every one of them sound; `null` otherwise. */
export function readOps(value: unknown): EditOp[] | null {
  if (!Array.isArray(value)) return null;
  const list: unknown[] = value;
  return list.every(isOp) ? [...list] : null;
}

/** Old id → new id, each a string; `null` otherwise. */
function readRenames(value: unknown): Record<string, string> | null {
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  const pairs = entries.flatMap(([from, to]): [string, string][] =>
    typeof to === 'string' ? [[from, to]] : [],
  );
  // `fromEntries` makes own keys, so no name reaches the prototype.
  return pairs.length === entries.length ? Object.fromEntries(pairs) : null;
}

/** One undo or redo step, made again from its checked fields; `null` when one does not fit. */
export function readGesture(value: unknown): Gesture | null {
  if (!isObject(value) || typeof value.label !== 'string') return null;
  const ops = readOps(value.ops);
  if (ops === null || ops.length === 0) return null;
  const gesture: Gesture = { ops, label: value.label };
  if (value.undoOps !== undefined) {
    const undoOps = readOps(value.undoOps);
    if (undoOps === null) return null;
    gesture.undoOps = undoOps;
  }
  const { selectCreated, flash } = value;
  if (selectCreated !== undefined) {
    if (typeof selectCreated !== 'boolean') return null;
    gesture.selectCreated = selectCreated;
  }
  if (flash !== undefined) {
    if (typeof flash !== 'boolean') return null;
    gesture.flash = flash;
  }
  if (value.renames !== undefined) {
    const renames = readRenames(value.renames);
    if (renames === null) return null;
    gesture.renames = renames;
  }
  // "This item" (ADR 0072): the copy its preview shows on.
  if (value.item !== undefined) {
    if (typeof value.item !== 'number' || !index(value.item)) return null;
    gesture.item = value.item;
  }
  return gesture;
}

const CHIP_KINDS = ['style', 'prop', 'text', 'utility'] as const;

const textOrNull = (value: unknown): string | null | undefined =>
  typeof value === 'string' ? value : value === null ? null : undefined;

function readChip(value: unknown): ChangeChip | null {
  if (!isObject(value) || typeof value.name !== 'string') return null;
  const kind = CHIP_KINDS.find((one) => one === value.kind);
  const before = textOrNull(value.before);
  const after = textOrNull(value.after);
  if (kind === undefined || before === undefined || after === undefined) return null;
  return { kind, name: value.name, before, after };
}

/** One line of the change list, made again from its checked fields; `null` when one does not fit. */
export function readChange(value: unknown): StepEntry | null {
  if (!isObject(value)) return null;
  const by = value.by === 'person' ? 'person' : value.by === 'claude' ? 'claude' : null;
  const element = textOrNull(value.id);
  const { label, files, offKit, at } = value;
  if (by === null || element === undefined || typeof label !== 'string') return null;
  if (!Array.isArray(files) || typeof offKit !== 'boolean') return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  const names: unknown[] = files;
  if (!names.every((file): file is string => typeof file === 'string')) return null;
  const { before, after } = value;
  if (before !== undefined && typeof before !== 'string') return null;
  if (after !== undefined && typeof after !== 'string') return null;
  const entry: StepEntry = {
    by,
    id: element,
    label,
    files: [...names],
    offKit,
    at,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
  if (value.chips === undefined) return entry;
  if (!Array.isArray(value.chips)) return null;
  const chips = value.chips.map(readChip);
  if (!chips.every((chip): chip is ChangeChip => chip !== null)) return null;
  return { ...entry, chips };
}

/** Every item of `value` read by `read`; `null` when it is no list or one item does not fit. */
export function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: unknown[] = value;
  const out: T[] = [];
  for (const item of items) {
    const one = read(item);
    if (one === null) return null;
    out.push(one);
  }
  return out;
}
