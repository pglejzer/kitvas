// The draft page's script: findings marked on the prototype, a state and a width switch without a
// reload, compare with a diff, the canvas (zoom, pan, widths), and a reload when a build or check
// of this draft ends. Without frames (a version not built) or without a frame that answers, links
// simply load the next page.

import { isCanvasFrame } from '../channel/canvas-protocol.ts';
import { isEditFrameMessage } from '../channel/edit-protocol.ts';
import type { ElementSnapshot } from '../channel/protocol.ts';
import { type Canvas, mountCanvas } from './canvas/canvas.ts';
import { mountWidth, type WidthControl } from './canvas/width-control.ts';
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
import { type Editor, startEditor } from './edit/start.ts';
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
  /** The switch whose findings are still on their way: until they are here, no marks of theirs. */
  awaited: number;
  width: WidthControl | undefined;
};

const currentFrame = (page: Page): Frame | undefined =>
  page.frames.find((frame) => frame.role === 'current');

/**
 * While the person edits, the page never loads itself again; the editor reloads only the frame.
 * The screen writes the mode on `main` (plan 15, C5).
 */
const editing = (main: HTMLElement): boolean => main.dataset.mode === 'edit';

/** Loads `href` the plain way, the fallback of a switch; never while the person edits. */
function loadPlainly(page: Page, href: string): void {
  if (!editing(page.main)) location.assign(href);
}

/**
 * Marks always match the notes on the page now, plus the diff in compare mode. The findings were
 * seen at the three preset widths: at any other width, and while the notes of a new width are on
 * their way, their marks are hidden.
 */
function refreshMarks(page: Page): void {
  const frame = currentFrame(page);
  if (!frame?.ready) return;
  const hidden = page.width?.marksHidden() === true || page.awaited === page.switches;
  const findings = hidden ? [] : marksFromNotes(readNotes(page.main));
  sendMarks(frame, pageMarks(findings, page.diff));
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

/**
 * Takes the regions of the view at `href` from the server (the findings, the links), then marks
 * the prototype again. `false` when the page could not be read or has other markup.
 */
async function swapFrom(page: Page, href: string, stale: () => boolean): Promise<boolean> {
  try {
    const fresh = await fetchPage(href);
    if (stale()) return true;
    if (!swapSections(page.main, fresh, page.state)) return false;
  } catch {
    return stale();
  }
  // The findings are here: their marks may show again.
  page.awaited = -1;
  // The fresh links know nothing of a custom width; the dock puts it back.
  page.width?.sync();
  refreshMarks(page);
  return true;
}

/** In compare mode the two frames are measured again once a change has settled. */
function measureSoon(page: Page, stale: () => boolean): void {
  if (!page.compare) return;
  setTimeout(() => {
    if (!stale()) measure(page);
  }, SETTLE_MS);
}

/** Starts a switch: older ones stop, and what was measured belongs to the view before. */
function nextTurn(page: Page): () => boolean {
  page.switches += 1;
  const turn = page.switches;
  page.pending?.done(false);
  page.diff = undefined;
  page.round = undefined;
  if (page.compare) writeSummary(page.main, undefined);
  return () => turn !== page.switches;
}

async function switchState(page: Page, state: string, href: string): Promise<void> {
  const stale = nextTurn(page);
  page.state = state;
  page.main.dataset.state = state;
  markStateOption(page.main, state);
  history.replaceState(history.state, '', href);
  const shown = waitForShown(page, state);
  for (const frame of page.frames) sendState(frame, state);
  if (!(await shown)) {
    if (!stale()) loadPlainly(page, href);
    return;
  }
  measureSoon(page, stale);
  if (!(await swapFrom(page, href, stale)) && !stale()) loadPlainly(page, href);
}

/**
 * The cards went to a preset width in place (`canvas/width-control.ts` already sized the frames
 * and wrote the address): the findings and marks of that width come from the server's page.
 */
async function switchWidth(page: Page, href: string): Promise<void> {
  const stale = nextTurn(page);
  page.awaited = page.switches;
  // The marks of the width before are wrong here; they come back with the new findings.
  refreshMarks(page);
  measureSoon(page, stale);
  if (!(await swapFrom(page, href, stale)) && !stale()) loadPlainly(page, href);
}

/**
 * The cards went to a width that is no preset: the findings stay those of the preset, with their
 * marks hidden, and what compare measured was of the width before.
 */
function resized(page: Page): void {
  // Not a switch of its own: a state switch on its way still brings its findings.
  const turn = page.switches;
  page.diff = undefined;
  page.round = undefined;
  if (page.compare) writeSummary(page.main, undefined);
  measureSoon(page, () => turn !== page.switches);
  refreshMarks(page);
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

/** The editor's zoom is the canvas zoom, and "zoom to selection" reads the editor's selection. */
function joinEditor(canvas: Canvas, editor: Editor): void {
  const { store } = editor;
  const follow = (zoom: number): void => {
    if (store.get().zoom !== zoom) store.set({ zoom });
  };
  follow(canvas.zoom());
  canvas.onZoom(follow);
  canvas.selectionFrom(() => {
    const state = store.get();
    return state.on ? state.selection[0] : undefined;
  });
}

export function startDraftPage(main: HTMLElement): void {
  const slug = main.dataset.draft;
  reloadWhenJobsEnd(
    (job) => job === slug,
    () => editing(main),
  );
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
    awaited: -1,
    width: undefined,
  };
  // The canvas works in Preview and in Edit, on a version that cannot be edited too.
  const canvas = mountCanvas(main, frames);
  page.width = mountWidth({
    main,
    frames,
    zoom: () => canvas?.zoom() ?? 1,
    centred: () => canvas?.centred() ?? true,
    onSettled: (href, preset) => {
      if (preset) void switchWidth(page, href);
      else resized(page);
    },
    onMarks: () => refreshMarks(page),
  });
  const current = currentFrame(page);
  const editor = current && !page.compare ? startEditor(main, current) : undefined;
  if (canvas && editor) joinEditor(canvas, editor);
  window.addEventListener('message', (event) => {
    const heard = frameMessage(page.frames, event);
    if (!heard) return;
    const { frame, message } = heard;
    if (isCanvasFrame(message)) {
      canvas?.hear(frame, message);
      return;
    }
    if (isEditFrameMessage(message)) {
      if (frame.role === 'current') editor?.receive(message);
      return;
    }
    if (message.type === 'ready') {
      canvas?.frameReady();
      onReady(page, frame);
    } else if (message.type === 'shown') onShown(page, frame, message.state);
    // `example` comes only from the kit page's frames; a draft frame has no use for it.
    else if (message.type === 'elements') onElements(page, frame, message.request, message.items);
  });
  // On `document`, so the controls and notes put in by a switch need no new listeners.
  document.addEventListener('click', (event) => onClick(page, event));
  measure(page);
}
