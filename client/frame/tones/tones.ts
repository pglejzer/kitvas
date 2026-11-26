// The studio's tones for what the frame draws over a draft (ADR 0057): the selection, the tags,
// the handles and the marks. The studio page sends the names of its theme and accent (`tones` of
// `client/channel/protocol.ts`); the colours come from the studio theme's own table
// (`src/studio/theme/tokens.ts`, which imports nothing: ADR 0080), never from the message, so
// nothing a page sends becomes CSS.
//
// An overlay calls `toned(host)` once for its host. The values are custom properties on that
// host only, read inside its closed shadow root as `var(--kv-select, Highlight)`: until a studio
// says its tones (a prototype opened on its own, an older studio) the sheet's system colour
// shows. Nothing is set on the draft's own elements, and nothing reaches a build.

import {
  ACCENT_COLORS,
  ON_SELECT,
  ON_TONE,
  THEME_COLORS,
  THEME_SHADOWS,
} from '../../../src/studio/theme/tokens.ts';
import type { FrameAccent, FrameTheme } from '../../channel/protocol.ts';

export type Tones = { theme: FrameTheme; accent: FrameAccent };

type MarkTones = Record<'fix' | 'review' | 'good' | 'on', string>;
type PopTones = Record<'pop' | 'ink' | 'inkMid' | 'shadow', string>;

/** The selection colour of each accent. It shows on a white draft and on a dark one. */
export const SELECT: Record<FrameAccent, string> = {
  copper: ACCENT_COLORS.copper.select,
  teal: ACCENT_COLORS.teal.select,
  coral: ACCENT_COLORS.coral.select,
  rose: ACCENT_COLORS.rose.select,
};

/** The tones of a mark in a theme, and the text on a mark filled with one (`on`). */
function marksOf(theme: FrameTheme): MarkTones {
  const colors = THEME_COLORS[theme];
  return { fix: colors.fix, review: colors.review, good: colors.good, on: ON_TONE[theme] };
}

/**
 * The popover look of a theme, for the lens pins (plan 19): the surface, its ink, and the pop
 * shadow. The light theme's ring is the line colour itself: the frame has no `--st-*`.
 */
function popOf(theme: FrameTheme): PopTones {
  const colors = THEME_COLORS[theme];
  const shadow = THEME_SHADOWS[theme].pop.replace('var(--st-color-line)', colors.line);
  return { pop: colors.pop, ink: colors.ink, inkMid: colors['ink-mid'], shadow };
}

/** The tones of a mark in each theme. */
export const MARK_TONES: Record<FrameTheme, MarkTones> = {
  dark: marksOf('dark'),
  light: marksOf('light'),
};

const POP_TONES: Record<FrameTheme, PopTones> = { dark: popOf('dark'), light: popOf('light') };

/** The custom properties an overlay's sheet may read. */
export const TONE_NAMES = [
  '--kv-select',
  '--kv-on-select',
  '--kv-fix',
  '--kv-review',
  '--kv-good',
  '--kv-on-tone',
  '--kv-pop',
  '--kv-ink',
  '--kv-ink-mid',
  '--kv-pop-shadow',
] as const;

export type ToneName = (typeof TONE_NAMES)[number];

export function toneValues({ theme, accent }: Tones): Record<ToneName, string> {
  const marks = MARK_TONES[theme];
  const pop = POP_TONES[theme];
  return {
    '--kv-select': SELECT[accent],
    '--kv-on-select': ON_SELECT,
    '--kv-fix': marks.fix,
    '--kv-review': marks.review,
    '--kv-good': marks.good,
    '--kv-on-tone': marks.on,
    '--kv-pop': pop.pop,
    '--kv-ink': pop.ink,
    '--kv-ink-mid': pop.inkMid,
    '--kv-pop-shadow': pop.shadow,
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
