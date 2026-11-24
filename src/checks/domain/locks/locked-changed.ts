// The rule `edit/locked-changed` (spec 4d, goal 4; plan 17, task C). The person locks an element
// in the editor; kitvas keeps its source as it was then (`<draft>/view.json`). When another writer
// (Claude, or the person in another editor) changed it since, the lock says so, so the person can
// restore it: kitvas never reverts it on its own. Sources are compared with whitespace collapsed,
// so a move that only indents an element again is no change. An element found neither by its id
// nor by the source it keeps is a lost lock. Pure: the app hands in the locks and the elements.

import type { RawFinding } from '../findings/finding.ts';

export const LOCKED_CHANGED = 'edit/locked-changed';
/** The ids of the rules in this folder; each has an `auto` entry in the guideline book. */
export const LOCK_RULE_IDS: readonly string[] = [LOCKED_CHANGED];

/** A lock as the latest version names its element, with the source it keeps. */
export type KeptLock = { id: string; text: string };

/** One element of the latest version now: where it is written, and its whole source. */
export type ElementNow = { id: string; file: string; line: number; column: number; source: string };

export type LockState = {
  /** The lock's id, as the rename logs carried it. */
  id: string;
  /** `same`: the source is the one kept (perhaps under another id: another writer moved it). */
  state: 'same' | 'changed' | 'lost';
  /** The element the lock is on now; `null` for a lost lock. */
  element: ElementNow | null;
};

/** Source text as a lock compares it; the same as `collapseSource` of the drafts module. */
export const collapseLockText = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** `sections/Hero:section/Button` is written in `src/tsx/sections/Hero.tsx`. */
const fileOf = (id: string): string => `src/tsx/${id.slice(0, Math.max(0, id.indexOf(':')))}.tsx`;

/**
 * Each lock's state, in the order of `locks`. In turn: an element at the lock's id whose source is
 * the kept one; else the one element of its file with that source (another writer moved it, and
 * its id changed); else the element at its id, changed; else none, lost. An element serves one
 * lock only.
 */
export function lockStates(
  locks: readonly KeptLock[],
  elements: readonly ElementNow[],
): LockState[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const texts = new Map<string, string>();
  const textOf = (element: ElementNow): string => {
    const known = texts.get(element.id);
    if (known !== undefined) return known;
    const made = collapseLockText(element.source);
    texts.set(element.id, made);
    return made;
  };
  const kept = locks.map((lock) => collapseLockText(lock.text));
  const found: (ElementNow | null)[] = locks.map(() => null);
  const taken = new Set<string>();
  locks.forEach((lock, index) => {
    const element = byId.get(lock.id);
    if (element === undefined || taken.has(element.id) || textOf(element) !== kept[index]) return;
    found[index] = element;
    taken.add(element.id);
  });
  locks.forEach((lock, index) => {
    if (found[index] !== null) return;
    const file = fileOf(lock.id);
    const same = elements.filter(
      (element) =>
        element.file === file && !taken.has(element.id) && textOf(element) === kept[index],
    );
    const only = same.length === 1 ? same[0] : undefined;
    if (only === undefined) return;
    found[index] = only;
    taken.add(only.id);
  });
  return locks.map((lock, index): LockState => {
    const element = found[index];
    if (element) return { id: lock.id, state: 'same', element };
    const there = byId.get(lock.id);
    if (there !== undefined && !taken.has(there.id)) {
      return { id: lock.id, state: 'changed', element: there };
    }
    return { id: lock.id, state: 'lost', element: null };
  });
}

/**
 * The findings of the locks that are not as kept: a changed one on its element, a lost one with
 * no element. Filed under `ds`, the check that reads the sources: `edit` is no check of its own.
 */
export function lockedChangedFindings(states: readonly LockState[]): RawFinding[] {
  return states.flatMap((state): RawFinding[] => {
    if (state.state === 'same') return [];
    const { element } = state;
    const base = { check: 'ds', rule: LOCKED_CHANGED, severity: 'fix' } as const;
    if (element === null) {
      return [
        {
          ...base,
          file: fileOf(state.id),
          line: 0,
          column: 0,
          element: null,
          message: { key: 'checkRule.editLockedLost', params: { id: state.id } },
          hint: { key: 'checkHint.editLockedLost', params: {} },
          states: [],
          widths: [],
        },
      ];
    }
    return [
      {
        ...base,
        file: element.file,
        line: element.line,
        column: element.column,
        element: element.id,
        message: { key: 'checkRule.editLockedChanged', params: {} },
        hint: { key: 'checkHint.editLockedChanged', params: {} },
        states: [],
        widths: [],
      },
    ];
  });
}
