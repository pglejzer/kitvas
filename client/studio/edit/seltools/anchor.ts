// Where the selected element is over the stage (redesign spec, goal 12; plan 19, task 4): the box
// the tools on the selection stand by. The edit card answers `locate` with the box of each copy
// asked (the chosen copy of a list item; every selected element, at most `MAX_LOCATED`), the
// union of the answers is turned into the stage's pixels (`toStage`, through the card's place and
// the zoom), and the tools read it with `box()`.
//
// It is asked again after a selection change, a build, a width or card change (`follow`,
// `again`). A movement on the screen (a scroll of the stage or in the card, a pan, a zoom, a
// window resize) takes the tools away at once and brings them back `RETURN_MS` after the last one
// (`moved`); a gesture that lasts (a drag, a handle, a width drag, an inline text edit) keeps
// them away while it is on (`hold`) and brings them back the same time after it ends. Each
// return asks where the element is now. The clock and the frame are ports, so this is tested
// without a browser; `seltools.ts` wires them.

import type { FrameBox } from '../../../channel/canvas-protocol.ts';
import type { EditorState } from '../store.ts';
import { type PageBox, unionBox } from './place.ts';

/** The tools come back this long after the last movement. */
export const RETURN_MS = 150;
/** The most copies one selection asks the card about. */
export const MAX_LOCATED = 8;
/**
 * The anchor's `locate` requests count from here. The canvas's own ("zoom to selection") count
 * from 1, and both hear every `located` of the card, so their numbers must never meet.
 */
export const FIRST_REQUEST = 600_000_000;
/** The protocol's largest request number. */
const LAST_REQUEST = 1_000_000_000;

/** One copy to locate: an element, and which of its copies (its first without `item`). */
export type AnchorTarget = { id: string; item?: number };

/** Time as a port: `after` runs `run` once, `ms` from now, unless the returned stop is called. */
export type Clock = { after(ms: number, run: () => void): () => void };

/** The gestures that keep the tools away while they last. */
export type HoldReason = 'drag' | 'handle' | 'resize' | 'text';

export type AnchorPorts = {
  clock: Clock;
  /** Asks the edit card where a copy is; its `located` answer comes to `located`. False: no card. */
  locate(target: AnchorTarget, request: number): boolean;
  /**
   * A box of the edit card's viewport as stage pixels, cut to what shows of the card and the
   * stage; `null` when none of it shows. Read when the answers are in.
   */
  toStage(box: FrameBox): PageBox | null;
};

export type Anchor = {
  /** The selected element's box in the stage's pixels; `null` while away or not located. */
  box(): PageBox | null;
  /** The selection's copies to locate (the first `MAX_LOCATED`); asked at once unless away. */
  follow(targets: readonly AnchorTarget[]): void;
  /** Something moved the element in its card (a build, a width, a card): ask again now. */
  again(): void;
  /** A movement: away at once, back `RETURN_MS` after the last one. */
  moved(): void;
  /** A gesture that lasts began (`true`) or ended. */
  hold(reason: HoldReason, on: boolean): void;
  /** An answer of the edit card to a `locate`. */
  located(request: number, box: FrameBox | null): void;
  /** Hears every change of what `box()` answers. Returns the way to stop. */
  onChange(listener: () => void): () => void;
};

/**
 * The copies of the selection to locate, in its order: the chosen copies of an id (ADR 0065), or
 * the id itself when it has none (its first copy); at most `MAX_LOCATED`.
 */
export function anchorTargets(state: Pick<EditorState, 'selection' | 'copies'>): AnchorTarget[] {
  const targets: AnchorTarget[] = [];
  for (const id of new Set(state.selection)) {
    const own = state.copies.flatMap((copy) =>
      copy.id === id && copy.item !== undefined ? [copy.item] : [],
    );
    if (own.length === 0) targets.push({ id });
    for (const item of own) targets.push({ id, item });
    if (targets.length >= MAX_LOCATED) break;
  }
  return targets.slice(0, MAX_LOCATED);
}

const sameTargets = (a: readonly AnchorTarget[], b: readonly AnchorTarget[]): boolean =>
  a.length === b.length && a.every((one, at) => one.id === b[at]?.id && one.item === b[at]?.item);

/** One `locate` per target, answered in any order. */
type Round = { first: number; boxes: (FrameBox | null | undefined)[] };

export function createAnchor(ports: AnchorPorts): Anchor {
  let targets: AnchorTarget[] = [];
  let round: Round | null = null;
  let result: PageBox | null = null;
  let next = FIRST_REQUEST;
  let moving = false;
  let stop: (() => void) | null = null;
  const holds = new Set<HoldReason>();
  const listeners = new Set<() => void>();

  const away = (): boolean => moving || holds.size > 0;

  function tell(): void {
    for (const listener of [...listeners]) listener();
  }

  /** A new round of `locate`: answers of an older one are dropped. */
  function ask(): void {
    round = null;
    if (targets.length === 0) {
      result = null;
      return;
    }
    if (next + targets.length > LAST_REQUEST) next = FIRST_REQUEST;
    const first = next;
    next += targets.length;
    const asked: Round = { first, boxes: targets.map(() => undefined) };
    round = asked;
    const sent = targets.every((target, index) => ports.locate(target, first + index));
    if (!sent && round === asked) {
      round = null;
      result = null;
    }
  }

  function back(): void {
    stop = null;
    moving = false;
    // A gesture still on brings them back when it ends.
    if (holds.size > 0) return;
    // The place before the movement is not the place now.
    result = null;
    ask();
    tell();
  }

  function moved(): void {
    const was = away();
    moving = true;
    stop?.();
    stop = ports.clock.after(RETURN_MS, back);
    if (!was) tell();
  }

  return {
    box: () => (away() ? null : result),
    follow(wanted) {
      const nextTargets = wanted.slice(0, MAX_LOCATED);
      // Another element: its old place is not its place.
      if (!sameTargets(targets, nextTargets)) result = null;
      targets = nextTargets;
      if (away()) round = null;
      else ask();
      tell();
    },
    again() {
      // Away, the return asks; else the place stays until the answer, so nothing flickers.
      if (away()) return;
      ask();
      if (round === null) tell();
    },
    moved,
    hold(reason, on) {
      if (on) {
        if (holds.has(reason)) return;
        const was = away();
        holds.add(reason);
        stop?.();
        stop = null;
        moving = false;
        if (!was) tell();
        return;
      }
      if (!holds.delete(reason)) return;
      // Like the end of a movement: back `RETURN_MS` after it.
      moved();
    },
    located(request, box) {
      const now = round;
      if (now === null) return;
      const index = request - now.first;
      if (index < 0 || index >= now.boxes.length || now.boxes[index] !== undefined) return;
      now.boxes[index] = box;
      if (now.boxes.includes(undefined)) return;
      round = null;
      const found = now.boxes.filter((one): one is FrameBox => one !== null && one !== undefined);
      const union = unionBox(found);
      result = union === null ? null : ports.toStage(union);
      tell();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
