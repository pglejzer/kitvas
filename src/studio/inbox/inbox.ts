// Notes people leave in the studio for Claude, queued until `kitvas inbox` takes them. The take
// is also how Claude listens for the editor's requests (spec 4d, goal 1): a request that comes
// while a take waits ends the wait at once (`wake`), and `waiting` tells the listening state.

import { randomUUID } from 'node:crypto';
import { SLUG } from '../../drafts/index.ts';
import { KitvasError, type Zod, z } from '../../shared/index.ts';

export const NewNoteSchema = z.strictObject({
  kind: z.literal('note'),
  /** The draft the note is about; `null` for the studio as a whole. */
  slug: z.string().regex(SLUG).nullable(),
  /** The element id (`data-ks`) it points at, if any. */
  element: z
    .string()
    // Element ids as the build makes them: `sections/Pricing:section/Stack.2`.
    .regex(/^[\w.:/$-]{1,200}$/)
    .nullable(),
  text: z.string().trim().min(1).max(4_000),
});

export const InboxItemSchema = NewNoteSchema.extend({ id: z.uuid(), at: z.string() });

export type NewNote = Zod.infer<typeof NewNoteSchema>;
export type InboxItem = Zod.infer<typeof InboxItemSchema>;

export type InboxLimits = {
  /** Notes kept for nobody; one more is refused. */
  items: number;
  /** The longest a take may wait. */
  maxWaitMs: number;
};

export const INBOX_LIMITS: InboxLimits = { items: 100, maxWaitMs: 600_000 };

/** A held take: its notes once they come or the time is up. `cancel` when the caller left. */
export type InboxWait = {
  items: Promise<InboxItem[]>;
  cancel(): void;
  /**
   * Once `items` is settled: true when the take ended for its caller (notes came, a request came,
   * the time was up), false when a newer take replaced it, its caller left or the studio stopped.
   * Only a take that ended for its caller is handed the waiting requests.
   */
  given(): boolean;
};

export type Inbox = {
  add(note: NewNote): InboxItem;
  /**
   * Every waiting note at once, else waits up to `timeoutMs` for the next one. One waiter at a
   * time: a newer take ends an older one with nothing.
   */
  wait(timeoutMs: number): InboxWait;
  pending(): number;
  /** Whether a take waits now: Claude listens (spec 4d). */
  waiting(): boolean;
  /** Ends a waiting take now with the notes there are: a request came for it (spec 4d). */
  wake(): void;
  /** Ends the waiter with nothing: the studio is stopping. */
  close(): void;
  /** Hears the studio stopping, after the waiter has ended. */
  onClose(listener: () => void): void;
};

export type InboxDeps = {
  now(): Date;
  /** Hears how many notes wait, after every change. */
  publish(pending: number): void;
  limits?: Partial<InboxLimits>;
};

type Waiter = { resolve(items: InboxItem[], given: boolean): void; timer: NodeJS.Timeout };

export function createInbox(deps: InboxDeps): Inbox {
  const { items: cap, maxWaitMs } = { ...INBOX_LIMITS, ...deps.limits };
  const queue: InboxItem[] = [];
  const closers: (() => void)[] = [];
  let waiter: Waiter | undefined;

  /** Answers the waiter, if there is one. */
  const answer = (items: InboxItem[], given: boolean): void => {
    const current = waiter;
    if (!current) return;
    waiter = undefined;
    clearTimeout(current.timer);
    current.resolve(items, given);
  };

  /** Hands every waiting note over. */
  const takeAll = (): InboxItem[] => {
    const items = queue.splice(0, queue.length);
    if (items.length > 0) deps.publish(0);
    return items;
  };

  return {
    add(note) {
      if (queue.length >= cap) throw new KitvasError('INBOX_FULL', { count: cap });
      const item: InboxItem = { id: randomUUID(), at: deps.now().toISOString(), ...note };
      queue.push(item);
      if (waiter) answer(takeAll(), true);
      else deps.publish(queue.length);
      return item;
    },
    wait(timeoutMs) {
      answer([], false);
      if (queue.length > 0 || timeoutMs <= 0) {
        return { items: Promise.resolve(takeAll()), cancel: () => undefined, given: () => true };
      }
      let settle: (items: InboxItem[]) => void = () => undefined;
      let given = false;
      const items = new Promise<InboxItem[]>((resolve) => {
        settle = resolve;
      });
      const mine: Waiter = {
        resolve: (found, forCaller) => {
          given = forCaller;
          settle(found);
        },
        timer: setTimeout(() => answer([], true), Math.min(timeoutMs, maxWaitMs)),
      };
      waiter = mine;
      return {
        items,
        cancel: () => {
          if (waiter !== mine) return;
          waiter = undefined;
          clearTimeout(mine.timer);
          settle([]);
        },
        given: () => given,
      };
    },
    pending: () => queue.length,
    waiting: () => waiter !== undefined,
    wake: () => answer(takeAll(), true),
    close: () => {
      answer([], false);
      for (const listener of closers.splice(0, closers.length)) listener();
    },
    onClose: (listener) => {
      closers.push(listener);
    },
  };
}
