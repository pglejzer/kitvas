// The listening line of the Claude tab (spec 4d, goal 1): whether a Claude Code session takes the
// requests now. "Claude is listening" while a take waits or ended moments ago, "Claude is working"
// while it has a request, otherwise the requests wait and the line gives the command that starts
// a session, with Copy. The bar shows the same state (`client/studio/shell/bar-status.ts`): the
// tab paints it with each state it reads, so the bar and the tab cannot disagree. The words are
// in `statusLine`, pure; `createStatus` draws them.

import type {
  Listening,
  RequestView,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import { barStateOf, LISTEN_RECHECK_MS, paintBarStatus } from '../../shell/bar-status.ts';
import { iconButton } from '../../ui/icon.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';

/**
 * The server tells a change of the listening state by an event, but the end of the grace after a
 * take may come with no event the page hears, so while a session is there the tab reads it again
 * this often (the bar's own time).
 */
export { LISTEN_RECHECK_MS };

export type StatusLine = {
  state: Listening['state'];
  /** The text key, under `studio.edit.`. */
  key: string;
  /** The command that starts a session; `null` while one listens or works. */
  command: string | null;
};

/** `/kitvas:edit shop`: the edit skill on this draft. */
export const commandOf = (slug: string): string => `/kitvas:edit ${slug}`;

export function statusLine(listening: Listening, slug: string): StatusLine {
  const { state } = listening;
  if (state === 'listening') return { state, key: 'ai.status.listening', command: null };
  if (state === 'working') return { state, key: 'ai.status.working', command: null };
  return { state, key: 'ai.status.off', command: commandOf(slug) };
}

/** The tab reads the requests again later: a session that ended says so on no event. */
export const recheckLater = (listening: Listening): boolean => listening.state !== 'off';

/** How many requests wait for Claude or are with it: the ones the status line counts as open. */
export const openCount = (requests: readonly Pick<RequestView, 'status'>[]): number =>
  requests.filter((request) => request.status === 'waiting' || request.status === 'taken').length;

/** What follows the status words: "1 request open", "3 requests open", "No requests open". */
export function openWords(open: number): { key: string; params: Record<string, number> } {
  if (open === 0) return { key: 'ai.status.openNone', params: {} };
  if (open === 1) return { key: 'ai.status.openOne', params: {} };
  return { key: 'ai.status.open', params: { n: open } };
}

export type Status = {
  element: HTMLElement;
  /** `open`: the requests open now, said after the status words. */
  render(listening: Listening, open: number): void;
};

/** A dot that says nothing itself: the words beside it do. */
function dotOf(): HTMLElement {
  const dot = el('span', 'k-dot');
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

/** The dot's state, as the bar's (`.k-dot`: green while listening, fading while working, grey when off). */
function setDot(dot: HTMLElement, listening: Listening): void {
  const state = barStateOf(listening);
  if (state === null) dot.removeAttribute('data-state');
  else dot.dataset.state = state;
}

/** The line, drawn once; `render` changes its words in place, so nothing is read twice. */
export function createStatus(slug: string, main: HTMLElement): Status {
  const element = el('div', 'claude-status');
  const line = el('p', 'claude-status-line');
  const dot = dotOf();
  const words = el('span', 'claude-status-words');
  words.setAttribute('role', 'status');
  const sub = el('span', 'k-meta claude-status-sub');
  line.append(dot, words, sub);
  const start = el('div', 'claude-start');
  const command = el('div', 'k-cmd');
  const copy = iconButton('copy', text('ai.copy.label'));
  command.append(el('code', undefined, commandOf(slug)), copy);
  copy.addEventListener('click', () => {
    const done = (key: string): void => toast(main, text(key));
    try {
      void navigator.clipboard.writeText(commandOf(slug)).then(
        () => done('copy.done'),
        () => done('ai.copy.failed'),
      );
    } catch {
      // A page without the clipboard (not a secure context): the command is there to select.
      done('ai.copy.failed');
    }
  });
  start.append(el('p', 'k-meta', text('ai.status.start')), command);
  element.append(line, start);

  let shown = '';
  // The first render is the store's state before the tab read anything (`ai.ts` draws it at
  // mount): the bar keeps the state it painted itself until the tab's first read comes.
  let read = false;
  return {
    element,
    render(listening, open) {
      const next = statusLine(listening, slug);
      element.dataset.state = next.state;
      setDot(dot, listening);
      const count = openWords(open);
      sub.textContent = text(count.key, count.params);
      // The same words are not set again: a screen reader would read them out once more.
      if (next.key !== shown) {
        shown = next.key;
        words.textContent = text(next.key);
      }
      start.hidden = next.command === null;
      if (read) paintBarStatus(listening);
      read = true;
    },
  };
}
