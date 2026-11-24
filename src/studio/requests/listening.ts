// Whether a Claude Code session answers the editor's requests now (spec 4d, goal 1): the status
// line of the AI tab. `listening` while a take of `kitvas inbox` waits, or for `LISTEN_GRACE_MS`
// after Claude's session last did something (a take ended, an answer came), which covers the
// moment between one take and the next; `working` while a request is taken; else `off`. A
// waiting take wins over a taken request: that session is free again.

import { LISTEN_GRACE_MS, type Listening } from '../api/requests/request-schemas.ts';

type State = Listening['state'];

export type SessionFacts = {
  /** A take waits now. */
  waiting: boolean;
  /** A request of some draft is taken now. */
  taken: boolean;
  /** When Claude's session last did something; `null`: never since the studio started. */
  seen: Date | null;
};

export function listeningState(facts: SessionFacts, now: Date): State {
  if (facts.waiting) return 'listening';
  if (facts.taken) return 'working';
  if (facts.seen !== null && now.getTime() - facts.seen.getTime() < LISTEN_GRACE_MS) {
    return 'listening';
  }
  return 'off';
}

/** Ms until the state lapses by time alone (the grace after a take ends); `null`: it does not. */
export function graceLeft(facts: SessionFacts, now: Date): number | null {
  if (facts.waiting || facts.taken || facts.seen === null) return null;
  const left = facts.seen.getTime() + LISTEN_GRACE_MS - now.getTime();
  return left > 0 ? left : null;
}

/** Timers the tracker and the request store set; tests pass their own. */
export type Timers = { set(run: () => void, ms: number): () => void };

/** Real timers that never keep the process alive. */
export const REAL_TIMERS: Timers = {
  set(run, ms) {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

export type ListeningDeps = {
  now(): Date;
  /** Whether a take waits and whether a request is taken, as they are now. */
  facts(): { waiting: boolean; taken: boolean };
  /** Hears each new state. */
  onChange(listening: Listening): void;
  timers: Timers;
};

export type ListeningTracker = {
  /** The state now; a change found on the way is told as `refresh` tells it. */
  current(): Listening;
  /** The facts may have changed. True when the state did, and `onChange` heard it. */
  refresh(): boolean;
  /** Claude's session did something now; then as `refresh`. */
  seen(): boolean;
  close(): void;
};

export function createListening(deps: ListeningDeps): ListeningTracker {
  let seen: Date | null = null;
  let closed = false;
  let cancelGrace: (() => void) | undefined;
  const factsNow = (): SessionFacts => ({ ...deps.facts(), seen });
  // The first look is a state the studio found, not one it saw begin: it has no `since`. It runs
  // while the studio starts, so a store that cannot be read then counts as no session, never as a
  // studio that does not start; the next look reads it again.
  const firstState = (): Listening['state'] => {
    try {
      return listeningState(factsNow(), deps.now());
    } catch {
      return 'off';
    }
  };
  let known: Listening = { state: firstState(), since: null };

  /** Run by a timer: a failure there must not end the studio; the next change looks again. */
  const later = (): void => {
    try {
      refresh();
    } catch {
      // Nothing to tell now.
    }
  };

  const refresh = (): boolean => {
    if (closed) return false;
    const now = deps.now();
    const facts = factsNow();
    const state = listeningState(facts, now);
    cancelGrace?.();
    cancelGrace = undefined;
    const left = graceLeft(facts, now);
    // When the grace ends the state changes with no other event: a timer tells it then.
    if (left !== null) cancelGrace = deps.timers.set(later, left + 1);
    if (known.state === state) return false;
    known = { state, since: now.toISOString() };
    deps.onChange(known);
    return true;
  };

  return {
    // Looked at again on every read: a grace that lapsed with no timer run yet still counts.
    current: () => {
      refresh();
      return known;
    },
    refresh,
    seen: () => {
      seen = deps.now();
      return refresh();
    },
    close: () => {
      closed = true;
      cancelGrace?.();
      cancelGrace = undefined;
    },
  };
}
