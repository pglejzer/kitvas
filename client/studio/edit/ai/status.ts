// The listening line of the AI tab (spec 4d, goal 1): whether a Claude Code session takes the
// requests now. "Claude is listening" while a take waits or ended moments ago, "Claude is working"
// while it has a request, otherwise the requests wait and the line gives the command that starts
// a session, with Copy. The words are in `statusLine`, pure; `createStatus` draws them.

import type { Listening } from '../../../../src/studio/api/requests/request-schemas.ts';
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

/** The tab reads the requests again later: a session that ended says so on no event. */
export const recheckLater = (listening: Listening): boolean => listening.state !== 'off';

export type Status = { element: HTMLElement; render(listening: Listening): void };

/** The line, drawn once; `render` changes its words in place, so nothing is read twice. */
export function createStatus(slug: string, main: HTMLElement): Status {
  const element = el('div', 'ai-status');
  const line = el('p', 'ai-status-line');
  const dot = el('span', 'ai-dot');
  dot.setAttribute('aria-hidden', 'true');
  const words = el('span', 'ai-status-words');
  words.setAttribute('role', 'status');
  line.append(dot, words);
  const start = el('p', 'ai-start');
  const command = el('code', 'ai-command', commandOf(slug));
  const copy = el('button', 'ai-button', text('ai.copy'));
  copy.type = 'button';
  copy.setAttribute('aria-label', text('ai.copy.label'));
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
  start.append(el('span', 'ai-start-words', text('ai.status.start')), command, copy);
  element.append(line, start);

  let shown = '';
  return {
    element,
    render(listening) {
      const next = statusLine(listening, slug);
      element.dataset.state = next.state;
      // The same words are not set again: a screen reader would read them out once more.
      if (next.key !== shown) {
        shown = next.key;
        words.textContent = text(next.key);
      }
      start.hidden = next.command === null;
    },
  };
}
