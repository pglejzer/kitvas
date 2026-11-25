// Claude's mark on the canvas, the page's side (spec 18e, D): which elements the frame marks, and
// when a request has just been answered. Pure over plain data, no DOM; `ai.ts` feeds it and sends
// the result as a `claude-marks` message through the bridge.
//
// Two reasons for a mark. Looking: while the Claude tab is shown and Edit is on, the selected
// elements (their chosen copies, as the selection draws them) carry a still mark, as the form says
// "About the selected element". Writing: a request that is `waiting` marks every copy of its elements
// still, a `taken` one marks them moving. A request that is answered, failed or dropped marks nothing.

import type { RequestStatus } from '../../../../src/studio/api/requests/request-schemas.ts';
import { type ClaudeMark, MAX_CLAUDE_MARKS } from '../../../channel/edit-protocol.ts';
import { NARROW_QUERY } from '../../shell/layout.ts';
import type { Bridge } from '../bridge.ts';
import type { Store } from '../store.ts';
import { text } from '../texts.ts';

export type MarksInput = {
  /** The Claude tab is the shown right tab and the right panel is open. */
  shown: boolean;
  /** Edit mode is on. */
  editing: boolean;
  selection: readonly string[];
  /** The chosen copies of the selected ids (the store's `copies`). */
  copies: readonly { id: string; item?: number }[];
  requests: readonly { elements: readonly string[]; status: RequestStatus }[];
  /** The ids the current version has (the layers tree): an id outside it gets no mark. */
  known: ReadonlySet<string>;
};

/** The marks to draw: each id (or each copy of it) once, moving when any reason says so. */
export function claudeMarks(input: MarksInput): ClaudeMark[] {
  const { shown, editing, selection, copies, requests, known } = input;
  const found = new Map<string, ClaudeMark>();
  const add = (mark: ClaudeMark): void => {
    if (!known.has(mark.id)) return;
    const key = mark.item === undefined ? mark.id : `${mark.id}#${mark.item}`;
    const before = found.get(key);
    found.set(key, before ? { ...before, motion: before.motion || mark.motion } : mark);
  };
  if (shown && editing) {
    for (const id of selection) {
      const own = copies.filter((copy) => copy.id === id && copy.item !== undefined);
      if (own.length === 0) add({ id, motion: false });
      for (const copy of own) {
        if (copy.item !== undefined) add({ id, item: copy.item, motion: false });
      }
    }
  }
  for (const request of requests) {
    if (request.status !== 'waiting' && request.status !== 'taken') continue;
    for (const id of request.elements) add({ id, motion: request.status === 'taken' });
  }
  const whole = new Map<string, ClaudeMark>();
  for (const mark of found.values()) if (mark.item === undefined) whole.set(mark.id, mark);
  // A mark on every copy covers a mark on one of them, unless that one moves and the whole is still.
  const marks = [...found.values()].filter((mark) => {
    const all = mark.item === undefined ? undefined : whole.get(mark.id);
    return all === undefined || (mark.motion && !all.motion);
  });
  return marks.slice(0, MAX_CLAUDE_MARKS);
}

type Listed = { id: string; status: RequestStatus; elements: readonly string[] };

/**
 * The elements of the requests that went from `waiting` or `taken` to `answered` between two
 * readings: the ones the canvas flashes once. A request that failed or was dropped flashes nothing,
 * and a request first seen already answered was not answered now.
 */
export function answeredIds(before: readonly Listed[], after: readonly Listed[]): string[] {
  const was = new Map(before.map((request) => [request.id, request.status]));
  const ids = new Set<string>();
  for (const request of after) {
    const status = was.get(request.id);
    if (request.status !== 'answered') continue;
    if (status !== 'waiting' && status !== 'taken') continue;
    for (const id of request.elements) ids.add(id);
  }
  return [...ids];
}

/**
 * Whether the Claude pane is in view: its pane not hidden, and the right panel open (not folded; in
 * a narrow window, open over the canvas).
 */
function paneShown(section: HTMLElement): boolean {
  const pane = section.closest<HTMLElement>('[data-pane]');
  const aside = section.closest<HTMLElement>('aside');
  if (!pane || pane.hidden || !aside || aside.hasAttribute('data-folded')) return false;
  const narrow = typeof matchMedia === 'function' && matchMedia(NARROW_QUERY).matches;
  return !narrow || aside.hasAttribute('data-overlay');
}

/**
 * Sends Claude's mark to the frames whenever what it shows changes (the requests, the selection or
 * its copies, Edit, the tree, the tab or the panel's fold), and flashes the elements of a request
 * that has just been answered. Only a changed message is sent.
 */
export function mountMarks(section: HTMLElement, store: Store, bridge: Bridge): void {
  let last = '';
  function send(): void {
    const state = store.get();
    const marks = claudeMarks({
      shown: paneShown(section),
      editing: state.on,
      selection: state.selection,
      copies: state.copies,
      requests: state.requests,
      known: new Set(state.tree.map((node) => node.id)),
    });
    const body = { type: 'claude-marks' as const, label: text('ai.mark'), marks };
    const key = JSON.stringify(body);
    if (key === last) return;
    last = key;
    bridge.send(body);
  }
  store.subscribe((state, previous) => {
    if (state.requests !== previous.requests) {
      const ids = answeredIds(previous.requests, state.requests);
      if (ids.length > 0) bridge.flash?.(ids);
    }
    send();
  });
  // The tab and the fold are attributes of the pane and the panel, not of the store.
  const watch = new MutationObserver(send);
  const options = { attributes: true, attributeFilter: ['hidden', 'data-folded', 'data-overlay'] };
  const pane = section.closest('[data-pane]');
  const aside = section.closest('aside');
  if (pane) watch.observe(pane, options);
  if (aside) watch.observe(aside, options);
  send();
}
