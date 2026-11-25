// What the ask bar is, as plain data (redesign spec goal 10; plan 19, task T3): its mode, the chip's
// name, the placeholder and whether Claude listens; and the small rules of what is typed (what is
// sent, what Enter does). Pure: no DOM, so the tests run in Node.

import { namesOf } from '../ai/names.ts';
import { MAX_REQUEST_TEXT } from '../ai/requests.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';

/** `off`: not in Edit. `viewing`: an older version is shown. `select`: nothing is selected. */
export type AskMode = 'off' | 'viewing' | 'select' | 'ready';

export type AskModel = {
  mode: AskMode;
  /** The chip's name ("Button", "3 elements"); `null` with nothing selected. */
  chip: string | null;
  placeholder: string;
  /** A Claude Code session takes requests (waiting or working). */
  listening: boolean;
};

/** The words of a text key, with `{name}` filled (the editor's `text`, or a test's own). */
export type Say = (key: string, params?: Record<string, string | number>) => string;

type AskState = Pick<EditorState, 'on' | 'viewing' | 'selection' | 'tree' | 'listening'>;

export function askModel(state: AskState, say: Say = text): AskModel {
  const mode = modeOf(state);
  const count = state.selection.length;
  const chip =
    count === 0
      ? null
      : count === 1
        ? namesOf(state.tree)(state.selection[0] ?? '')
        : say('ask.chip.many', { n: count });
  const key = {
    off: 'ask.placeholder.off',
    viewing: 'ask.placeholder.viewing',
    select: 'ask.placeholder.select',
    ready: 'ask.placeholder.ready',
  }[mode];
  return { mode, chip, placeholder: say(key), listening: state.listening.state !== 'off' };
}

function modeOf(state: AskState): AskMode {
  if (!state.on) return 'off';
  if (state.viewing !== null) return 'viewing';
  return state.selection.length === 0 ? 'select' : 'ready';
}

/** What goes to Claude from the field's raw text. */
export type Prepared = {
  words: string;
  /** The text was longer than a request takes and was cut. */
  cut: boolean;
};

/**
 * The words to send: trimmed, and cut at `MAX_REQUEST_TEXT`. `null` when only spaces are there, so
 * nothing is sent. The text is data: it is sent, never run.
 */
export function wordsToSend(raw: string): Prepared | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length <= MAX_REQUEST_TEXT) return { words: trimmed, cut: false };
  return { words: trimmed.slice(0, MAX_REQUEST_TEXT).trim(), cut: true };
}

/** The parts of a key event the field reads. */
export type KeyLike = { key: string; isComposing?: boolean; keyCode?: number; shiftKey?: boolean };

/** Enter sends, except while an IME composes a character (Safari reports it as keyCode 229). */
export function isSendKey(event: KeyLike): boolean {
  if (event.key !== 'Enter') return false;
  if (event.isComposing === true || event.keyCode === 229) return false;
  return event.shiftKey !== true;
}
