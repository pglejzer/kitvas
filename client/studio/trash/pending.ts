// A delete made on a draft's own page leaves for the gallery, which offers Undo for the rest of its
// 8 seconds (ADR 0064). The note travels in the tab's session storage; where that is missing or
// full, the delete simply has no Undo message, and Restore in Deleted still brings the draft back.

export const UNDO_MS = 8000;
const KEY = 'kitvas:trash-undo';

export type PendingUndo = { slug: string; title: string; at: number };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionStore(): Store | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

export function savePending(pending: PendingUndo, store: Store | undefined = sessionStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(pending));
  } catch {
    // No note: the gallery shows no Undo.
  }
}

/** The note, once: it is removed as it is read. `undefined` when it is missing, old or broken. */
export function takePending(
  now: number,
  store: Store | undefined = sessionStore(),
): PendingUndo | undefined {
  try {
    const raw = store?.getItem(KEY);
    if (raw === null || raw === undefined) return undefined;
    store?.removeItem(KEY);
    const read: unknown = JSON.parse(raw);
    if (typeof read !== 'object' || read === null) return undefined;
    const { slug, title, at } = read as Record<string, unknown>;
    if (typeof slug !== 'string' || typeof title !== 'string' || typeof at !== 'number') {
      return undefined;
    }
    return now - at <= UNDO_MS ? { slug, title, at } : undefined;
  } catch {
    return undefined;
  }
}

/** Milliseconds of Undo left for a note. */
export const leftOf = (pending: PendingUndo, now: number): number =>
  Math.max(0, UNDO_MS - (now - pending.at));
