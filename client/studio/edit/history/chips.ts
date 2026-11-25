// What a change did, as short chips (`size md → lg`; plan 18, task D): the Changes rail shows one
// row of them per step, and a variant card of the Claude tab its changes. Pure: no DOM, and no
// text for people; `chip-view.ts` draws them and words what has no name of its own.

import type { EditOp, PropValue, StyleValue } from '../../../../src/edit/index.ts';
import type { VariantChange } from '../../../../src/studio/api/requests/request-schemas.ts';
import type { ChangeEntry } from '../store.ts';

/**
 * One changed thing. `kind` says what `name` is: a style property, a prop, or empty for the text
 * and a utility class, which the view names. `before: null`: there was none; `after: null`: removed.
 */
export type ChangeChip = {
  kind: 'style' | 'prop' | 'text' | 'utility';
  name: string;
  before: string | null;
  after: string | null;
};

/** A change list line that knows its chips: `history.ts` writes them, the rail reads them. */
export type StepEntry = ChangeEntry & { chips?: readonly ChangeChip[] };

/** At most this many chips per step; the step's label says the rest. */
export const MAX_CHIPS = 3;
/** A text or a value longer than this is cut short, with an ellipsis. */
export const MAX_CHIP_TEXT = 24;

const clip = (value: string): string =>
  value.length <= MAX_CHIP_TEXT ? value : `${value.slice(0, MAX_CHIP_TEXT - 1)}…`;

/** `space.md` for `var(--kit-space-md)`; a raw value as it is written. */
export function styleWords(value: StyleValue): string {
  return 'token' in value ? value.token.replace(/^--kit-/, '').replace('-', '.') : clip(value.raw);
}

/** A prop's value as the source writes it, without the quotes of a string. */
export const propWords = (value: PropValue): string =>
  value.kind === 'string' ? clip(value.value) : String(value.value);

/** The chip of one op; `null` for an op that changes no named value (structure, classes, files). */
export function opChip(op: EditOp): ChangeChip | null {
  switch (op.op) {
    case 'setProp':
      return {
        kind: 'prop',
        name: op.name,
        before: op.before === null ? null : propWords(op.before),
        after: propWords(op.value),
      };
    case 'removeProp':
      return { kind: 'prop', name: op.name, before: propWords(op.before), after: null };
    case 'setText':
    case 'setItemText':
      return { kind: 'text', name: '', before: clip(op.before), after: clip(op.value) };
    case 'setStyle':
      return {
        kind: 'style',
        name: op.property,
        before: op.before === null ? null : styleWords(op.before),
        after: styleWords(op.value),
      };
    case 'removeStyle':
      return { kind: 'style', name: op.property, before: styleWords(op.before), after: null };
    case 'setUtility':
      return { kind: 'utility', name: '', before: op.before, after: op.value };
    default:
      return null;
  }
}

/** Chips of one thing join: the first `before`, the last `after` (a property on three elements). */
function joined(chips: readonly ChangeChip[]): ChangeChip[] {
  const byKey = new Map<string, ChangeChip>();
  for (const chip of chips) {
    const key = `${chip.kind}|${chip.name}`;
    const had = byKey.get(key);
    byKey.set(key, had ? { ...had, after: chip.after } : chip);
  }
  return [...byKey.values()].slice(0, MAX_CHIPS);
}

/** The chips of a gesture's ops, in the order they first change each thing. */
export function opChips(ops: readonly EditOp[]): ChangeChip[] {
  return joined(ops.flatMap((op) => opChip(op) ?? []));
}

/** What one change of a variant sets, before its element is read. */
function changeChip(change: VariantChange): ChangeChip {
  if (change.kind === 'style') {
    return { kind: 'style', name: change.property, before: null, after: styleWords(change.value) };
  }
  if (change.kind === 'prop') {
    return { kind: 'prop', name: change.name, before: null, after: propWords(change.value) };
  }
  if (change.kind === 'text') {
    return { kind: 'text', name: '', before: null, after: clip(change.value) };
  }
  return { kind: 'utility', name: '', before: change.before, after: change.value };
}

/** The chips of a variant's changes, before its elements are read: what each change sets. */
export function changeChips(changes: readonly VariantChange[]): ChangeChip[] {
  return joined(changes.map(changeChip));
}
