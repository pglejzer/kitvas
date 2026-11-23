// The draft page's script: findings marked on the prototype, a state switch without a reload,
// compare with a diff, and a reload when a build or check of this draft ends. Without frames (a
// version not built) or without a frame that answers, links simply load the next page.

import type { ElementSnapshot } from '../channel/protocol.ts';
import { isPlainClick } from './clicks.ts';
import { diffElements, type ElementDiff } from './diff.ts';
import {
  markStateOption,
  readNotes,
  sameOriginHref,
  stateLinkOf,
  swapSections,
  writeSummary,
} from './draft-dom.ts';
import {
  type Frame,
  type FrameRole,
  findFrames,
  frameMessage,
  isStateId,
  sendMarks,
  sendMeasure,
  sendState,
} from './frames.ts';
import { reloadWhenJobsEnd } from './live.ts';
import { marksFromNotes, pageMarks } from './marks.ts';

/** How long the current frame has to show a new state before the page is loaded the plain way. */
const SHOWN_TIMEOUT_MS = 3_000;
/** The prototype's move takes 240 ms; boxes and styles are measured once it has finished. */
const SETTLE_MS = 320;

/** A state switch waiting for the current frame's `shown`. */
type Pending = { state: string; done(ok: boolean): void };

/** One `measure` sent to every frame; compare mode diffs the two answers of one round. */
type Round = { request: number; answers: Map<FrameRole, ElementSnapshot[]> };

type Page = {
  main: HTMLElement;
  frames: Frame[];
  compare: boolean;
  /** The state the page shows, or is switching to. */
  state: string;
  diff: ElementDiff | undefined;
  round: Round | undefined;
  requests: number;
  pending: Pending | undefined;
  /** Counts switches; a step of an older switch sees a newer number and stops. */
  switches: number;
};

const currentFrame = (page: Page): Frame | undefined =>
  page.frames.find((frame) => frame.role === 'current');

/** Marks always match the notes on the page now, plus the diff in compare mode. */
function refreshMarks(page: Page): void {
  const frame = currentFrame(page);
  if (!frame?.ready) return;
  sendMarks(frame, pageMarks(marksFromNotes(readNotes(page.main)), page.diff));
}

/** Also a probe: a frame that loaded before this script ran answers it, so it counts as ready. */
function measure(page: Page): void {
  page.requests += 1;
  page.round = { request: page.requests, answers: new Map() };
  for (const frame of page.frames) sendMeasure(frame, page.requests);
}

function onReady(page: Page, frame: Frame): void {
  frame.ready = true;
  if (frame.role === 'current') refreshMarks(page);
  const all = page.frames.every((item) => item.ready);
  if (page.compare && all && page.pending === undefined) measure(page);
}

function onShown(page: Page, frame: Frame, state: string): void {
  if (frame.role !== 'current') return;
  refreshMarks(page);
  if (page.pending?.state === state) page.pending.done(true);
}

function onElements(page: Page, frame: Frame, request: number, items: ElementSnapshot[]): void {
  const first = !frame.ready;
  frame.ready = true;
  if (first && frame.role === 'current') refreshMarks(page);
  const round = page.round;
  if (!page.compare || round?.request !== request) return;
  round.answers.set(frame.role, items);
  const before = round.answers.get('before');
  const after = round.answers.get('current');
  if (!before || !after) return;
  page.round = undefined;
  page.diff = diffElements(before, after);
  refreshMarks(page);
  writeSummary(page.main, page.diff);
}

/** `true` on the current frame's `shown` of `state`; `false` after a timeout or a newer switch. */
function waitForShown(page: Page, state: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      if (page.pending?.done === done) page.pending = undefined;
      resolve(ok);
    };
    page.pending = { state, done };
    setTimeout(() => done(false), SHOWN_TIMEOUT_MS);
  });
}

/**
 * The server's page as inert markup. A `DOMParser` document takes this page's CSP, so the fresh
 * page's `<style>` (another nonce) would log a violation; a template's content applies nothing.
 */
async function fetchPage(href: string): Promise<DocumentFragment> {
  const response = await fetch(href, {
    credentials: 'same-origin',
    headers: { accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`The page answered ${response.status}.`);
  const template = document.createElement('template');
  template.innerHTML = await response.text();
  return template.content;
}

async function switchState(page: Page, state: string, href: string): Promise<void> {
  page.switches += 1;
  const turn = page.switches;
  const stale = (): boolean => turn !== page.switches;
  page.pending?.done(false);
  page.state = state;
  page.diff = undefined;
  page.round = undefined;
  page.main.dataset.state = state;
  markStateOption(page.main, state);
  history.replaceState(history.state, '', href);
  if (page.compare) writeSummary(page.main, undefined);
  const shown = waitForShown(page, state);
  for (const frame of page.frames) sendState(frame, state);
  if (!(await shown)) {
    if (!stale()) location.assign(href);
    return;
  }
  if (page.compare) {
    setTimeout(() => {
      if (!stale()) measure(page);
    }, SETTLE_MS);
  }
  try {
    const fresh = await fetchPage(href);
    if (stale()) return;
    if (!swapSections(page.main, fresh, state)) throw new Error('The page has other markup.');
    refreshMarks(page);
  } catch {
    if (!stale()) location.assign(href);
  }
}

function onClick(page: Page, event: MouseEvent): void {
  if (!isPlainClick(event)) return;
  const link = stateLinkOf(page.main, event.target);
  const state = link?.dataset.state;
  if (!link || state === undefined || !isStateId(state)) return;
  const href = sameOriginHref(link);
  // A frame that never answered cannot switch; the browser loads the page instead.
  if (href === undefined || !page.frames.every((frame) => frame.ready)) return;
  event.preventDefault();
  if (state === page.state) return;
  switchState(page, state, href);
}

export function startDraftPage(main: HTMLElement): void {
  const slug = main.dataset.draft;
  reloadWhenJobsEnd((job) => job === slug);
  const frames = findFrames(main);
  if (frames.length === 0) return;
  const roles = new Set(frames.map((frame) => frame.role));
  const page: Page = {
    main,
    frames,
    compare: main.dataset.compare !== undefined && roles.has('before') && roles.has('current'),
    state: main.dataset.state ?? '',
    diff: undefined,
    round: undefined,
    requests: 0,
    pending: undefined,
    switches: 0,
  };
  window.addEventListener('message', (event) => {
    const heard = frameMessage(page.frames, event);
    if (!heard) return;
    const { frame, message } = heard;
    if (message.type === 'ready') onReady(page, frame);
    else if (message.type === 'shown') onShown(page, frame, message.state);
    // `example` comes only from the kit page's frames; a draft frame has no use for it.
    else if (message.type === 'elements') onElements(page, frame, message.request, message.items);
  });
  // On `document`, so the controls and notes put in by a switch need no new listeners.
  document.addEventListener('click', (event) => onClick(page, event));
  measure(page);
}
