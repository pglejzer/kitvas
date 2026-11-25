// The rules of locked and hidden elements on the page (spec 4d, goal 4; plan 17, task C), pure so
// they are tested without a DOM: the view answer read, the lists to save, the Live items of the
// locks another writer changed, and what the locks box shows for the selection.

import type { StreamEvent } from '../../live/sse.ts';
import { elementName } from '../history/changes.ts';
import type { EditorState, LiveItem } from '../store.ts';
import { elementOf } from '../store.ts';

/** The rule of a lock another writer changed (`src/checks/domain/locks/`). */
export const LOCK_RULE = 'edit/locked-changed';
/** Copy of `MAX_VIEW_IDS` (src/drafts/domain/view.ts): the client imports no server value. */
export const MAX_VIEW_IDS = 500;

/** `GET …/view`: ids as the latest version names them. */
export type ViewAnswer = { locked: string[]; hidden: string[]; changed: string[]; lost: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ids = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((one) => typeof one === 'string') ? [...value] : null;

/** The view answer; `null` for anything else. */
export function readView(body: unknown): ViewAnswer | null {
  if (!isRecord(body)) return null;
  const locked = ids(body.locked);
  const hidden = ids(body.hidden);
  const changed = ids(body.changed);
  const lost = ids(body.lost);
  if (locked === null || hidden === null || changed === null || lost === null) return null;
  return { locked, hidden, changed, lost };
}

/** The draft a `locks` event names: another writer changed a locked element of it. */
export function locksSlugOf(event: StreamEvent): string | undefined {
  if (event.event !== 'locks') return undefined;
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  return isRecord(data) && typeof data.slug === 'string' ? data.slug : undefined;
}

export const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const unique = (list: readonly string[]): string[] => [...new Set(list)];

/**
 * The lists to write: the store's, and the lost locks the person has not dealt with yet, so the
 * server keeps them until the person locks again or forgets them.
 */
export function viewToSave(
  state: Pick<EditorState, 'locked' | 'hidden'>,
  lost: readonly string[],
): { locked: string[]; hidden: string[] } {
  return {
    locked: unique([...state.locked, ...lost]).slice(0, MAX_VIEW_IDS),
    hidden: unique(state.hidden).slice(0, MAX_VIEW_IDS),
  };
}

/** One Live item per changed lock, on its element: a code finding, to fix. */
export function lockItems(changed: readonly string[], message: string): LiveItem[] {
  return unique(changed).map((id) => ({
    id,
    rule: LOCK_RULE,
    severity: 'fix',
    width: null,
    message,
    source: 'code',
  }));
}

/**
 * `live` with exactly `items` as its lock items (the live checks write `store.live` from their own
 * lists, which have none); `null` when it has them already.
 */
export function withLockItems(
  live: readonly LiveItem[],
  items: readonly LiveItem[],
): LiveItem[] | null {
  const have = live.filter((item) => item.rule === LOCK_RULE);
  const same =
    have.length === items.length &&
    items.every((item) => have.some((one) => one.id === item.id && one.message === item.message));
  if (same) return null;
  return [...live.filter((item) => item.rule !== LOCK_RULE), ...items];
}

/** What the locks box shows now. */
export type LocksModel = {
  /** The selected element is locked and another writer changed it: Restore or Unlock. */
  changed: { id: string; name: string } | null;
  /** Locks whose element was not found; each can be locked again on the selection, or forgotten. */
  lost: { id: string; name: string }[];
  /** Lock again puts the lock on `selection[0]`: there is one, and it is not locked yet. */
  canLockAgain: boolean;
  /** The last edit was refused because of a lock; `unlock`: the element it names is the locked one. */
  refused: { unlock: string | null } | null;
};

export function locksModel(
  state: Pick<EditorState, 'on' | 'selection' | 'locked' | 'lockChanged' | 'refused'>,
  lost: readonly string[],
): LocksModel {
  const selected = state.selection[0] ?? null;
  const changed =
    selected !== null && state.lockChanged.includes(selected) && state.locked.includes(selected)
      ? { id: selected, name: elementName(selected) }
      : null;
  const { refused } = state;
  const byLock = refused !== null && refused.reason === 'locked';
  const op = byLock ? refused.gesture.ops[refused.index] : undefined;
  const named = op === undefined ? null : elementOf(op);
  return {
    changed: state.on ? changed : null,
    lost: state.on ? lost.map((id) => ({ id, name: elementName(id) })) : [],
    canLockAgain: selected !== null && !state.locked.includes(selected),
    refused:
      state.on && byLock
        ? { unlock: named !== null && state.locked.includes(named) ? named : null }
        : null,
  };
}

/** Claude's words when kitvas cannot put a lock's source back itself. Data, never an order. */
export function restoreAsk(
  id: string,
  missing: readonly string[],
  old: string,
  max = 1_000,
): string {
  const head = `Please put the locked element ${id} back to the source it was locked with.`;
  const why = ` kitvas could not do it itself because the file lacks ${missing.join(', ')}.`;
  const room = max - head.length - why.length - 2;
  const source = old.length <= room ? old : `${old.slice(0, Math.max(0, room - 1))}…`;
  return `${head}${why} ${source}`.slice(0, max).trim();
}
