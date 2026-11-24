// The studio's tones for what the frame draws over a draft (ADR 0057): the selection, the tags,
// the handles and the marks. The studio page sends the names of its theme and accent (`tones` of
// `client/channel/protocol.ts`); the colours come from the fixed table here, never from the
// message, so nothing a page sends becomes CSS. The table repeats `src/studio/theme/tokens.ts`
// (the frame bundle imports no value from `src/`); a test holds the two together.
//
// An overlay calls `toned(host)` once for its host. The values are custom properties on that
// host only, read inside its closed shadow root as `var(--kv-select, Highlight)`: until a studio
// says its tones (a prototype opened on its own, an older studio) the sheet's system colour
// shows. Nothing is set on the draft's own elements, and nothing reaches a build.

import type { FrameAccent, FrameTheme } from '../../channel/protocol.ts';

export type Tones = { theme: FrameTheme; accent: FrameAccent };

/** The selection colour of each accent. It shows on a white draft and on a dark one. */
export const SELECT: Record<FrameAccent, string> = {
  copper: '#b75d1d',
  teal: '#0c8571',
  coral: '#d04715',
  rose: '#de2474',
};

/** Text on the selection colour: a draft is not themed, so it is the same in both themes. */
export const ON_SELECT = '#ffffff';

/** The tones of a mark in each theme, and the text on a mark filled with one (`on`). */
export const MARK_TONES: Record<FrameTheme, Record<'fix' | 'review' | 'good' | 'on', string>> = {
  dark: { fix: '#ea755c', review: '#e3c04b', good: '#4cba7a', on: '#1d2025' },
  light: { fix: '#b3331f', review: '#7d6500', good: '#1f6b3a', on: '#ffffff' },
};

/** The custom properties an overlay's sheet may read. */
export const TONE_NAMES = [
  '--kv-select',
  '--kv-on-select',
  '--kv-fix',
  '--kv-review',
  '--kv-good',
  '--kv-on-tone',
] as const;

export type ToneName = (typeof TONE_NAMES)[number];

export function toneValues({ theme, accent }: Tones): Record<ToneName, string> {
  const marks = MARK_TONES[theme];
  return {
    '--kv-select': SELECT[accent],
    '--kv-on-select': ON_SELECT,
    '--kv-fix': marks.fix,
    '--kv-review': marks.review,
    '--kv-good': marks.good,
    '--kv-on-tone': marks.on,
  };
}

/** A host as far as the tones go: an element, or a stand-in in a test. */
export type TonedHost = { style: { setProperty(name: string, value: string): void } };

const hosts = new Set<TonedHost>();
let current: Tones | null = null;

function paint(host: TonedHost, tones: Tones): void {
  for (const [name, value] of Object.entries(toneValues(tones))) {
    host.style.setProperty(name, value);
  }
}

/** `host` takes the tones now, if the studio said them, and whenever they change. */
export function toned(host: TonedHost): void {
  hosts.add(host);
  if (current) paint(host, current);
}

/** The studio said its theme and accent: every overlay's host takes them. */
export function setTones(tones: Tones): void {
  current = tones;
  for (const host of hosts) paint(host, tones);
}
