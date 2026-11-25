// What the lens that is on sends each card (redesign spec, goal 9; plan 19, task 1): the pins of
// that lens, built from what the page knows now, checked as the frame will check them, at most
// `MAX_PINS`, and sent to a card only when they changed (or the card lost them). Design sends none;
// Kit and Changes send none outside Edit. The page's `marks` carry compare's outlines alone now
// (`../draft/marks.ts`): the findings' numbered dots and the live tags became the Checks lens's
// pins, and no other lens sends either (plan 19, call 2). Pure but for the sender's default post.

import { type LensPin, MAX_PINS, readLensPin } from '../../channel/lens-protocol.ts';
import type { LiveGroup } from '../edit/live/items.ts';
import type { ChangeEntry } from '../edit/store.ts';
import type { WhyReport } from '../edit/why/entries.ts';
import { type Frame, sendLens } from '../frames.ts';
import { type LensId, lensAllowed } from './lens.ts';
import type { LensCounts } from './pill.ts';
import { changePins } from './pins/changes.ts';
import { checkCount, checkPins, type FullFinding } from './pins/checks.ts';
import { type SectionRef, whyPins } from './pins/why.ts';

/** What the pins are built from, as the page and the editor hold it now. */
export type LensSources = {
  /** The full check's findings; `[]` while their marks are hidden (a width that is no preset). */
  findings: readonly FullFinding[];
  /** The live findings by element (`liveGroups`); `[]` outside Edit. */
  live: readonly LiveGroup[];
  /** The Why report; `null` until it is read. */
  why: WhyReport | null;
  /** The layout's sections (`structure.sections`); `[]` without the editor. */
  sections: readonly SectionRef[];
  changes: readonly ChangeEntry[];
  /** The Kit lens's pins (`kitPins`), from its last read. */
  kit: readonly LensPin[];
};

/** The pins `lens` shows on a card `width` pixels wide: none in Design, none it may not show. */
export function lensPins(
  lens: LensId,
  editing: boolean,
  sources: LensSources,
  width: number,
): LensPin[] {
  if (!lensAllowed(lens, editing)) return [];
  switch (lens) {
    case 'design':
      return [];
    case 'kit':
      return [...sources.kit];
    case 'checks':
      return checkPins(sources.findings, sources.live, width);
    case 'why':
      return sources.why === null ? [] : whyPins(sources.why, sources.sections);
    case 'changes':
      return changePins(sources.changes);
  }
}

/** The pins a frame takes, as it reads them: a bad one is left out, not the whole list. */
export function cleanPins(pins: readonly LensPin[]): LensPin[] {
  const keys = new Set<string>();
  const clean: LensPin[] = [];
  for (const pin of pins) {
    const read = readLensPin(pin);
    if (!read || keys.has(read.key)) continue;
    keys.add(read.key);
    clean.push(read);
  }
  return clean;
}

/** The first `MAX_PINS` pins, and how many more there were. */
export function capPins(pins: readonly LensPin[]): { pins: LensPin[]; left: number } {
  return { pins: pins.slice(0, MAX_PINS), left: Math.max(0, pins.length - MAX_PINS) };
}

/** The counts on the pill: the findings the Checks pane lists, and the session's changes. */
export function lensCounts(state: {
  findings: readonly FullFinding[];
  live: readonly LiveGroup[];
  changes: readonly ChangeEntry[];
}): LensCounts {
  return { checks: checkCount(state.findings, state.live), changes: state.changes.length };
}

export type Sender = {
  /** Sends `pins` to `frame` unless it has these already. */
  send(frame: Frame, pins: readonly LensPin[]): void;
  /** The frame lost what it drew (it loaded, or took a build in place): the next send goes out. */
  forget(frame: Frame): void;
};

export function createSender(
  post: (frame: Frame, pins: LensPin[]) => void = (frame, pins) =>
    sendLens(frame, { type: 'lens-pins', pins }),
): Sender {
  const sent = new WeakMap<Frame, string>();
  return {
    send(frame, pins) {
      const said = JSON.stringify(pins);
      if (sent.get(frame) === said) return;
      sent.set(frame, said);
      post(frame, [...pins]);
    },
    forget(frame) {
      sent.delete(frame);
    },
  };
}
