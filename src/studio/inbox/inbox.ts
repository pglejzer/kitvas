// Notes people leave in the studio for Claude, queued until `kitvas inbox` takes them.

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
    .regex(/^[\w.:-]{1,200}$/)
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
export type InboxWait = { items: Promise<InboxItem[]>; cancel(): void };

export type Inbox = {
  add(note: NewNote): InboxItem;
  /**
   * Every waiting note at once, else waits up to `timeoutMs` for the next one. One waiter at a
   * time: a newer take ends an older one with nothing.
   */
  wait(timeoutMs: number): InboxWait;
  pending(): number;
  /** Ends the waiter with nothing: the studio is stopping. */
  close(): void;
};

export type InboxDeps = {
  now(): Date;
  /** Hears how many notes wait, after every change. */
  publish(pending: number): void;
  limits?: Partial<InboxLimits>;
};

type Waiter = { resolve(items: InboxItem[]): void; timer: NodeJS.Timeout };

export function createInbox(deps: InboxDeps): Inbox {
  const { items: cap, maxWaitMs } = { ...INBOX_LIMITS, ...deps.limits };
  const queue: InboxItem[] = [];
  let waiter: Waiter | undefined;

  /** Answers the waiter, if there is one. */
  const answer = (items: InboxItem[]): void => {
    const current = waiter;
    if (!current) return;
    waiter = undefined;
    clearTimeout(current.timer);
    current.resolve(items);
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
      if (waiter) answer(takeAll());
      else deps.publish(queue.length);
      return item;
    },
    wait(timeoutMs) {
      answer([]);
      if (queue.length > 0 || timeoutMs <= 0) {
        return { items: Promise.resolve(takeAll()), cancel: () => undefined };
      }
      let resolve: (items: InboxItem[]) => void = () => undefined;
      const items = new Promise<InboxItem[]>((settle) => {
        resolve = settle;
      });
      const mine: Waiter = {
        resolve,
        timer: setTimeout(() => answer([]), Math.min(timeoutMs, maxWaitMs)),
      };
      waiter = mine;
      return {
        items,
        cancel: () => {
          if (waiter !== mine) return;
          waiter = undefined;
          clearTimeout(mine.timer);
          resolve([]);
        },
      };
    },
    pending: () => queue.length,
    close: () => answer([]),
  };
}
