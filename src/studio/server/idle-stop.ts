// The idle stop (ADR 0042): a studio nobody has used for the set minutes stops itself, the same
// way the shutdown route stops it. Use is a request to the studio origin other than the events
// stream, or a job that runs; an open tab alone never keeps a studio up for days.

import { EVENTS_PATH } from '../api/event-routes.ts';

/** Time and one-shot timers; tests pass their own, so nothing waits for minutes. */
export type IdleClock = {
  /** Milliseconds, as `Date.now()` gives them. */
  now(): number;
  /** Calls `fn` once after `ms`; the function it returns cancels that call. */
  after(ms: number, fn: () => void): () => void;
};

export const SYSTEM_CLOCK: IdleClock = {
  now: () => Date.now(),
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    // The servers keep the process alive; this timer alone must not.
    timer.unref();
    return () => clearTimeout(timer);
  },
};

export type IdleStopInput = {
  /** Minutes without use; 0 never stops. */
  minutes: number;
  /** Whether a job runs now: a running job is use until it ends. */
  busy(): boolean;
  /** Stops the studio; called once at most. */
  stop(): void;
  clock?: IdleClock;
};

export type IdleStop = {
  /** The studio was used just now, such as by a job that started or ended. */
  touch(): void;
  /**
   * Use that lasts, such as a request while it is answered (an inbox take waits for minutes).
   * Call the function it returns when it ends; the wait counts from then.
   */
  hold(): () => void;
  /** No more checks: the studio is stopping anyway. */
  close(): void;
};

const MINUTE_MS = 60_000;

/**
 * Whether a request to the studio origin is use. The events stream is not: a tab opens it by
 * itself and opens it again after every drop, so counting it would keep a forgotten tab's studio
 * running forever.
 */
export function isUse(url: string | undefined): boolean {
  const path = (url ?? '').split('?', 1)[0];
  return path !== EVENTS_PATH;
}

/** Starts counting now. One timer at a time: use only moves the time the next check reads. */
export function startIdleStop(input: IdleStopInput): IdleStop {
  const limit = input.minutes * MINUTE_MS;
  if (limit <= 0) {
    return { touch: () => undefined, hold: () => () => undefined, close: () => undefined };
  }
  const clock = input.clock ?? SYSTEM_CLOCK;
  let last = clock.now();
  let holds = 0;
  let closed = false;
  let cancel: (() => void) | undefined;
  const touch = (): void => {
    if (!closed) last = clock.now();
  };
  const check = (): void => {
    cancel = undefined;
    if (closed) return;
    const now = clock.now();
    // Use that still lasts is use now; its end touches again, so the wait counts from there.
    if (holds > 0 || input.busy()) last = now;
    const left = last + limit - now;
    if (left > 0) {
      cancel = clock.after(left, check);
      return;
    }
    closed = true;
    input.stop();
  };
  cancel = clock.after(limit, check);
  return {
    touch,
    hold() {
      touch();
      holds += 1;
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        holds -= 1;
        touch();
      };
    },
    close() {
      closed = true;
      cancel?.();
      cancel = undefined;
    },
  };
}
