// Claude's status in a bar (spec 6.3, ADR 0068): the dot and the short words at the bar's end, and
// `data-claude` on `<html>`, which the logo's working sign reads (`skin/logo.ts`). One painter for
// the page bar and the editor bar, so they cannot disagree. The state is the studio's one
// listening session: `GET /api/v1/listening` and the `listening` event. The words are the page's,
// on the slot (`[data-bar-listening]`, `data-text-listening`, `data-text-working`).
//
// On mount the bar paints the state this tab knew last (session storage), so a reload does not
// blink, then reads the state and paints that. It stays current from the events and, while a
// session is there, by reading again every 20 s. A lost stream or a failed read paints nothing:
// the status and the logo's working sign never stay on "working" while the studio cannot be heard.

import { isRecord as isObject } from '../../../src/shared/values/guards.ts';
import type { Listening } from '../../../src/studio/api/requests/request-schemas.ts';
import { onStudioEvent, onStudioHealth, openStudioStream } from '../live/live.ts';
import type { StreamEvent, StreamHealth } from '../live/sse.ts';

/** What the bar shows: the dot and the words of a state, or nothing. */
export type BarState = 'listening' | 'working' | null;

/**
 * While a session is seen the bar reads the state again this often: its end may come with no
 * event the page hears (the grace after a take lapses, an event lost on the way).
 */
export const LISTEN_RECHECK_MS = 20_000;

const LISTENING_URL = '/api/v1/listening';
/** The session-storage key of the state this tab knew last. */
export const BAR_STATE_KEY = 'kitvas-claude';
const STATES: readonly Listening['state'][] = ['listening', 'working', 'off'];

/** What the bar shows for a state; `null` (unknown, off, or the stream lost) shows nothing. */
export function barStateOf(listening: Listening | null): BarState {
  if (listening === null || listening.state === 'off') return null;
  return listening.state;
}

/** A listening state as the studio sends it, read with care; `null` for anything else. */
export function readListening(value: unknown): Listening | null {
  if (!isObject(value)) return null;
  const state = STATES.find((each) => each === value.state);
  const { since } = value;
  if (state === undefined) return null;
  if (since === null) return { state, since: null };
  if (typeof since !== 'string' || since.length > 64) return null;
  return { state, since };
}

/** The state a `listening` event carries; `undefined` for another event or data of another shape. */
export function listeningOf(event: StreamEvent): Listening | undefined {
  if (event.event !== 'listening') return undefined;
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  return readListening(data) ?? undefined;
}

/** The parts of a storage the bar uses; `sessionStorage` is one. */
export type BarStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The state this tab knew last; `null` when it knew none, or the storage refuses. */
export function recallBarState(storage: () => BarStorage): BarState {
  try {
    const kept = storage().getItem(BAR_STATE_KEY);
    return kept === 'listening' || kept === 'working' ? kept : null;
  } catch {
    return null;
  }
}

/** Keeps the state for the tab's next page; a storage that refuses is ignored. */
export function rememberBarState(storage: () => BarStorage, state: BarState): void {
  try {
    if (state === null) storage().removeItem(BAR_STATE_KEY);
    else storage().setItem(BAR_STATE_KEY, state);
  } catch {
    // Private windows and blocked storage: the next page paints from its read alone.
  }
}

/** One-shot timers; tests pass their own. */
export type BarTimer = { after(ms: number, fn: () => void): () => void };

export type BarWatchDeps = {
  /** Shows a state in the bar and on `<html>`. */
  paint(listening: Listening | null): void;
  /** Reads the state now; `null` when the read fails. */
  read(): Promise<Listening | null>;
  timer: BarTimer;
};

/** The decisions of the bar's status, apart from the page: what to paint, and when to read. */
export type BarWatch = StreamHealth & {
  /** Reads the state now and paints what the read says. */
  check(): void;
  /** One event of the page's stream. */
  heard(event: StreamEvent): void;
};

export function watchBar(deps: BarWatchDeps): BarWatch {
  let cancel: (() => void) | undefined;
  /** Counts the reads and the events: only the newest answer is painted. */
  let turn = 0;
  /** The stream is lost: nothing is painted until it is open again. */
  let unheard = false;

  const stopTimer = (): void => {
    cancel?.();
    cancel = undefined;
  };

  const show = (listening: Listening | null): void => {
    deps.paint(listening);
    stopTimer();
    if (barStateOf(listening) !== null) cancel = deps.timer.after(LISTEN_RECHECK_MS, check);
  };

  function check(): void {
    turn += 1;
    const mine = turn;
    void deps.read().then((listening) => {
      // A newer read or event said more; a stream lost meanwhile cannot be heard.
      if (mine !== turn || unheard) return;
      show(listening);
    });
  }

  return {
    check,
    heard(event) {
      if (unheard) return;
      // Events were missed, and a change of the state may be one of them.
      if (event.event === 'reset') {
        check();
        return;
      }
      const listening = listeningOf(event);
      if (listening === undefined) return;
      turn += 1;
      show(listening);
    },
    opened() {
      unheard = false;
      // What changed while no stream was open is told by no event: read it.
      check();
    },
    lost() {
      unheard = true;
      turn += 1;
      stopTimer();
      deps.paint(null);
    },
  };
}

/** The bar's slot on this page; `null` on a page whose bar has none. */
function slotOf(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-bar-listening]');
}

const sessionStore = (): BarStorage => window.sessionStorage;

/** The slot's dot and words, made once and changed in place. */
function draw(slot: HTMLElement, state: BarState): void {
  if (state === null) {
    if (slot.firstChild) slot.replaceChildren();
    slot.removeAttribute('title');
    return;
  }
  const said =
    (state === 'listening' ? slot.dataset.textListening : slot.dataset.textWorking) ?? '';
  let dot = slot.querySelector<HTMLElement>(':scope > .k-dot');
  let words = slot.querySelector<HTMLElement>(':scope > .k-bar-status-words');
  if (!dot || !words) {
    dot = document.createElement('span');
    dot.className = 'k-dot';
    // A dot that says nothing itself: the words beside it do.
    dot.setAttribute('aria-hidden', 'true');
    words = document.createElement('span');
    words.className = 'k-bar-status-words';
    slot.replaceChildren(dot, words);
  }
  dot.dataset.state = state;
  // The same words are not set again: the status would be read out once more.
  if (words.textContent !== said) words.textContent = said;
  // A narrow bar hides the words and keeps the dot: the words are one hover away.
  slot.title = said;
}

/**
 * Shows a state in the bar and on `<html>` (`data-claude`), and keeps it for the tab's next page.
 * The editor's Claude tab calls it with each state it reads.
 */
export function paintBarStatus(listening: Listening | null): void {
  const state = barStateOf(listening);
  const slot = slotOf();
  if (slot) draw(slot, state);
  const root = document.documentElement;
  if (state === null) delete root.dataset.claude;
  else root.dataset.claude = state;
  rememberBarState(sessionStore, state);
}

/** `GET /api/v1/listening`; `null` when the studio does not answer with a state. */
async function readNow(): Promise<Listening | null> {
  try {
    const response = await fetch(LISTENING_URL, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return readListening(body);
  } catch {
    return null;
  }
}

const REAL_TIMER: BarTimer = {
  after(ms, fn) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};

/**
 * Finds the bar's status slot and keeps it current; does nothing on a page with no slot. Call it
 * once from the page's entry script. It hears the page's one events stream, and opens it when no
 * other part of the page has.
 */
export function mountBarStatus(): void {
  if (!slotOf()) return;
  const knew = recallBarState(sessionStore);
  paintBarStatus(knew === null ? null : { state: knew, since: null });
  const watch = watchBar({ paint: paintBarStatus, read: readNow, timer: REAL_TIMER });
  onStudioEvent((event) => watch.heard(event));
  onStudioHealth(watch);
  openStudioStream();
  watch.check();
}
