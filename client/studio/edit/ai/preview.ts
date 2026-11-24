// A variant tried before it is offered (spec 4d, goal 2, "checked before it is offered"; plan 17,
// task B). Pointing at a variant's card, or focusing it, shows its edits in the cards at once (the
// edit preview of 4a) and has the card that shows them measure the changed elements (the live
// checks of 4c); the card shows the check sign or the warnings. Leaving it takes the preview back.
// Never during a drag, while an edit is on its way or while Edit is off (`allowed`). The rules
// are here over injected ports, so they are tested without a browser; `ai.ts` wires them.

import type { EditOp } from '../../../../src/edit/index.ts';
import { MAX_PREVIEW, type PreviewChange } from '../../../channel/edit-protocol.ts';
import { type LiveFact, MAX_LIVE_IDS } from '../../../channel/live-protocol.ts';
import type { Frame } from '../../frames.ts';
import { factText } from '../live/items.ts';
import { previewApplies } from '../style/context-rules.ts';
import { previewOf } from '../style/preview-of.ts';

/** What a card previews: its ops, the elements to measure, the width its request is for. */
export type Previewable = { ops: readonly EditOp[]; ids: readonly string[]; width: number | null };

export type CheckProblem = { severity: 'fix' | 'review'; message: string };

export type CheckResult =
  | { state: 'running' }
  /** Measured with the preview shown: no problem, or these. */
  | { state: 'done'; problems: CheckProblem[] }
  /** Nothing of it shows before the build (props, utility classes): the checks run after Apply. */
  | { state: 'after' };

export type PreviewPorts = {
  /** Shows the changes in the cards from `width` up (`bridge.sendPreview`). */
  show(changes: PreviewChange[], width: number | null): void;
  /** Takes every preview back (`unpreview`). */
  hide(): void;
  /** Asks the card that shows the preview to measure `ids`: the request's number, or `null`. */
  measure(ids: string[], width: number | null): number | null;
  /** Whether a preview may start now. */
  allowed(): boolean;
  /** The card's variant, ready to apply; `null` when it is not (any more). */
  find(key: string): Previewable | null;
  /** The previewed card changed: `store.variant`. */
  shown(key: string | null): void;
  /** A card's check changed: its sign is drawn again. */
  checked(key: string): void;
};

export type VariantPreview = {
  /** The pointer is over a card (`null`: over none). */
  point(key: string | null): void;
  /** Focus is in a card (`null`: in none). */
  focus(key: string | null): void;
  /** A `live-facts` answer of any card. */
  facts(request: number, facts: readonly LiveFact[]): void;
  /**
   * The card is being applied: the history shows the same edits and the build replaces them,
   * so its preview is left in place, and nothing is previewed until the pointer comes again.
   */
  handOver(key: string): void;
  /** The frames lost the preview (a refused edit, a new build): shown again when still wanted. */
  lost(): void;
  /** The cards were drawn again, or what `allowed` reads changed: the preview follows. */
  refresh(): void;
  /** The files changed: every check was made on elements that are not so any more. */
  reset(): void;
  check(key: string): CheckResult | undefined;
  current(): string | null;
};

/** The frame changes a card's ops show at once; the rest wait for the build. */
export function previewChanges(ops: readonly EditOp[]): PreviewChange[] {
  return ops
    .flatMap((op) => {
      const change = previewOf(op);
      return change ? [change] : [];
    })
    .slice(0, MAX_PREVIEW);
}

/** Some of the ops show only after the build (a prop, a utility class, a removed value). */
export const showsLater = (ops: readonly EditOp[]): boolean =>
  ops.some((op) => previewOf(op) === null);

/** A card's facts as its warnings: the fixes first, each words once; mismatches are the build's. */
export function problemsOf(facts: readonly LiveFact[]): CheckProblem[] {
  const seen = new Set<string>();
  const problems: CheckProblem[] = [];
  for (const fact of facts) {
    if (fact.rule === 'mismatch') continue;
    const message = factText(fact);
    if (seen.has(message)) continue;
    seen.add(message);
    problems.push({ severity: fact.severity, message });
  }
  const rank = (problem: CheckProblem): number => (problem.severity === 'fix' ? 0 : 1);
  return problems.sort((a, b) => rank(a) - rank(b));
}

/** The card that measures: the first, the edit card first, that shows a preview for `width`. */
export function measuringFrame(
  frames: readonly Frame[],
  widthOf: ((frame: Frame) => number) | undefined,
  width: number | null,
): Frame | undefined {
  const shows = widthOf ? frames.find((frame) => previewApplies(widthOf(frame), width)) : undefined;
  return shows ?? frames[0];
}

export function createVariantPreview(ports: PreviewPorts): VariantPreview {
  let pointer: string | null = null;
  let focused: string | null = null;
  let current: string | null = null;
  /** The measurement on its way, and the card it is for. */
  let pending: { request: number; key: string } | null = null;
  const checks = new Map<string, CheckResult>();

  function start(key: string, variant: Previewable): void {
    const changes = previewChanges(variant.ops);
    if (changes.length === 0) {
      checks.set(key, { state: 'after' });
      ports.checked(key);
      return;
    }
    ports.show(changes, variant.width);
    const request = ports.measure(variant.ids.slice(0, MAX_LIVE_IDS), variant.width);
    if (request === null) return;
    pending = { request, key };
    checks.set(key, { state: 'running' });
    ports.checked(key);
  }

  /** A measurement made for a card no longer shown is not its check: the card has none. */
  function dropPending(): void {
    if (pending === null) return;
    const { key } = pending;
    pending = null;
    if (checks.get(key)?.state === 'running') checks.delete(key);
    ports.checked(key);
  }

  /** Previews the wanted card (the pointer's before the focus's), or none. */
  function update(): void {
    const wanted = pointer ?? focused;
    const variant = wanted !== null && ports.allowed() ? ports.find(wanted) : null;
    const next = variant ? wanted : null;
    if (next === current) return;
    if (current !== null) ports.hide();
    dropPending();
    current = next;
    if (next !== null && variant) start(next, variant);
    ports.shown(current);
  }

  return {
    point(key) {
      pointer = key;
      update();
    },
    focus(key) {
      focused = key;
      update();
    },
    facts(request, facts) {
      if (pending === null || pending.request !== request) return;
      const { key } = pending;
      pending = null;
      checks.set(key, { state: 'done', problems: problemsOf(facts) });
      ports.checked(key);
    },
    handOver(key) {
      if (current !== key) return;
      dropPending();
      current = null;
      pointer = null;
      focused = null;
      ports.shown(null);
    },
    lost() {
      if (current === null) return;
      // Nothing to take back in the frames; the card is shown again if it is still wanted.
      dropPending();
      current = null;
      update();
      if (current === null) ports.shown(null);
    },
    refresh() {
      update();
    },
    reset() {
      checks.clear();
      pending = null;
    },
    check: (key) => checks.get(key),
    current: () => current,
  };
}
