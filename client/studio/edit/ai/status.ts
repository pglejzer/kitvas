// The listening line of the Claude tab (spec 4d, goal 1): whether a Claude Code session takes the
// requests now. "Claude is listening" while a take waits or ended moments ago, "Claude is working"
// while it has a request, otherwise the requests wait and the line gives the command that starts
// a session, with Copy. Plan 18, task D: the same state in the bar (`[data-edit-listening]`, C8),
// a `.k-dot` and the short words. The words are in `statusLine` and `barStatus`, pure;
// `createStatus` draws them.

import type { Listening } from '../../../../src/studio/api/requests/request-schemas.ts';
import { iconButton } from '../../ui/icon.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';

/**
 * The server tells a change of the listening state by an event only for drafts with open
 * requests, so while it says a session is there the tab reads it again this often.
 */
export const LISTEN_RECHECK_MS = 20_000;

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

/**
 * The bar's status: the dot's state (`.k-dot`: green while listening, fading while working,
 * grey when off) and its short words.
 */
export function barStatus(listening: Listening): {
  dot: 'listening' | 'working' | null;
  key: string;
} {
  const { state } = listening;
  if (state === 'listening') return { dot: 'listening', key: 'ai.bar.listening' };
  if (state === 'working') return { dot: 'working', key: 'ai.bar.working' };
  return { dot: null, key: 'ai.bar.off' };
}

/** The tab reads the requests again later: a session that ended says so on no event. */
export const recheckLater = (listening: Listening): boolean => listening.state !== 'off';

export type Status = { element: HTMLElement; render(listening: Listening): void };

/** A dot that says nothing itself: the words beside it do. */
function dotOf(): HTMLElement {
  const dot = el('span', 'k-dot');
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function setDot(dot: HTMLElement, state: 'listening' | 'working' | null): void {
  if (state === null) dot.removeAttribute('data-state');
  else dot.dataset.state = state;
}

/** The bar's part, filled once; `null` on a page whose bar has none. */
function barPart(main: HTMLElement): ((listening: Listening) => void) | null {
  const host = main.querySelector<HTMLElement>('[data-edit-listening]');
  if (!host) return null;
  const dot = dotOf();
  const words = el('span', 'claude-bar-words');
  host.classList.add('claude-bar');
  host.replaceChildren(dot, words);
  return (listening) => {
    const next = barStatus(listening);
    setDot(dot, next.dot);
    const said = text(next.key);
    if (words.textContent !== said) words.textContent = said;
  };
}

/** The line, drawn once; `render` changes its words in place, so nothing is read twice. */
export function createStatus(slug: string, main: HTMLElement): Status {
  const element = el('div', 'claude-status');
  const line = el('p', 'claude-status-line');
  const dot = dotOf();
  const words = el('span', 'claude-status-words');
  words.setAttribute('role', 'status');
  line.append(dot, words);
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
  const bar = barPart(main);

  let shown = '';
  return {
    element,
    render(listening) {
      const next = statusLine(listening, slug);
      element.dataset.state = next.state;
      setDot(dot, barStatus(listening).dot);
      // The same words are not set again: a screen reader would read them out once more.
      if (next.key !== shown) {
        shown = next.key;
        words.textContent = text(next.key);
      }
      start.hidden = next.command === null;
      bar?.(listening);
    },
  };
}
