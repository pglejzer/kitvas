// The draft page's script: findings marked on the prototype, a state and a width switch without a
// reload, compare with a diff, the canvas (zoom, pan, widths, the width cards of stage 4c), and a
// reload when a build or check of this draft ends. Without frames (a version not built) or
// without a frame that answers, links simply load the next page.
//
// The findings, their marks, compare and the state switch belong to `page.frames` (the frame of
// the width shown and a compared one). The width cards beside it (`cards`) get the state and the
// editor's messages, and their own zoom, but no marks of findings made at another width.
//
// Plan 19: the lenses (`../lens/mount.ts`) draw over the width shown and the width cards. The
// findings' numbered dots are the Checks lens's pins now, so `marks` carries compare's outlines
// alone; the lenses hear every moment the marks were sent at.

import { isCanvasFrame } from '../../channel/canvas-protocol.ts';
import { isEditFrameMessage } from '../../channel/edit-protocol.ts';
import { isLiveFrame } from '../../channel/live-protocol.ts';
import type { ElementSnapshot } from '../../channel/protocol.ts';
import { type Canvas, mountCanvas } from '../canvas/canvas.ts';
import { createCardList, frameWidth } from '../canvas/card-list.ts';
import { type Cards, mountCards } from '../canvas/cards.ts';
import { mountFit } from '../canvas/fit/mount.ts';
import { mountWidth, type WidthControl } from '../canvas/width-control.ts';
import { isPlainClick } from '../clicks.ts';
import { CHECKS_SWAPPED_EVENT } from '../edit/live/check.ts';
import { type Editor, startEditor } from '../edit/start.ts';
import {
  type Frame,
  type FrameRole,
  findFrames,
  frameMessage,
  isStateId,
  sendMarks,
  sendMeasure,
  sendState,
} from '../frames.ts';
import { type LensPage, mountLens } from '../lens/mount.ts';
import { reloadWhenJobsEnd } from '../live/live.ts';
import { mountOptions } from '../options/row.ts';
import { diffElements, type ElementDiff } from './diff.ts';
import { markStateOption, sameOriginHref, stateLinkOf, swapSections, writeSummary } from './dom.ts';
import { pageMarks } from './marks.ts';
import type { Opening } from './opening.ts';

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
  /** The width cards beside the width shown (stage 4c); none while comparing. */
  cards: Cards | undefined;
  /** Tells the lenses what the marks hear: the findings, the width, the diff (plan 19). */
  lensChanged(): void;
};

/** The frames of the width cards beside the width shown. */
const extraFrames = (page: Page): Frame[] => page.cards?.extras() ?? [];

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
 * The findings were seen at the three preset widths: at any other width, and while the notes of a
 * new width are on their way, the Checks lens shows none of them.
 */
const findingsHidden = (page: Page): boolean =>
  page.width?.marksHidden() === true || page.awaited === page.switches;

/**
 * The marks match the diff in compare mode, and the lenses the notes on the page now. Before plan
 * 19 the findings' dots went here too; the Checks lens draws them as pins (`../lens/`).
 */
function refreshMarks(page: Page): void {
  page.lensChanged();
  const frame = currentFrame(page);
  if (!frame?.ready) return;
  sendMarks(frame, pageMarks(page.diff));
}

/** The cards the lenses draw on: the width shown and the cards beside it, never a compared one. */
const lensFrames = (page: Page): Frame[] => {
  const current = currentFrame(page);
  return current ? [current, ...extraFrames(page)] : [];
};

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
  // The fresh links know nothing of a custom width; the dock puts it back, and the cards.
  page.width?.sync();
  page.cards?.links();
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
  for (const frame of [...page.frames, ...extraFrames(page)]) sendState(frame, state);
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

export function startDraftPage(main: HTMLElement, opening: Opening): void {
  const slug = main.dataset.draft;
  reloadWhenJobsEnd(
    (job) => job === slug,
    () => editing(main),
  );
  const frames = findFrames(main);
  if (frames.length === 0) return;
  // A frame is blank until its page has drawn: the screen waits for each (`opening.ts`).
  const drawn = new Map(frames.map((frame) => [frame, opening.hold()]));
  const roles = new Set(frames.map((frame) => frame.role));
  const lensListeners = new Set<() => void>();
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
    cards: undefined,
    lensChanged() {
      for (const listener of [...lensListeners]) listener();
    },
  };
  const current = currentFrame(page);
  // Before the editor starts: its bridge finds the cards by the current frame (`cardsOf`).
  const list = current ? createCardList(current) : undefined;
  // The canvas works in Preview and in Edit, on a version that cannot be edited too.
  const canvas = mountCanvas(main, frames, list);
  page.width = mountWidth({
    main,
    frames,
    zoom: () => canvas?.zoom() ?? 1,
    centred: () => canvas?.centred() ?? true,
    onSettled: (href, preset) => {
      // The cards beside the width shown follow it once it rests, never during a drag.
      page.cards?.sync();
      if (preset) void switchWidth(page, href);
      else resized(page);
    },
    onMarks: () => refreshMarks(page),
    onApply: (width) => page.cards?.leadWidth(width),
  });
  if (current && list) {
    page.cards = mountCards({
      main,
      lead: current,
      list,
      onEvery: () => canvas?.everyWidth(),
    });
  }
  // Plan 25: the options of the version, before the editor starts so its panels find the store.
  const options = mountOptions(main, {
    frames: () => list?.frames() ?? (current ? [current] : []),
    cards: list,
  });
  const editor = current && !page.compare ? startEditor(main, current) : undefined;
  if (canvas && editor) joinEditor(canvas, editor);
  if (editor) options?.joinEditor(editor.store);
  if (editor?.store.get().on === true) {
    // The page opens in Edit: the screen waits for the tree the Layers pane draws.
    const listed = opening.hold();
    const stop = editor.store.subscribe((state, previous) => {
      if (state.tree === previous.tree) return;
      stop();
      listed();
    });
  }
  // Plan 19: the lenses, in Preview and in Edit, on a version that cannot be edited too.
  const lensPage: LensPage = {
    main,
    frames: () => lensFrames(page),
    widthOf: (frame) => list?.widthOf(frame) ?? frameWidth(frame),
    findingsHidden: () => findingsHidden(page),
    onChange(listener) {
      lensListeners.add(listener);
      return () => {
        lensListeners.delete(listener);
      };
    },
  };
  // A card that comes or goes, or another width: its pins are built again.
  list?.onChange(() => page.lensChanged());
  mountLens(editor?.store ?? null, lensPage);
  // The top bars make room for each other by steps (`../canvas/fit/`). After every pill is drawn,
  // the lens pill too, so the first pass measures what the person will see.
  mountFit(main);
  window.addEventListener('message', (event) => {
    const extras = extraFrames(page);
    const heard = frameMessage([...page.frames, ...extras], event);
    if (!heard) return;
    const { frame, message } = heard;
    if (message.type === 'ready' || message.type === 'elements') drawn.get(frame)?.();
    // A frame that loaded again or took a build in shows the options it was built with: it is
    // told the ones the page shows. The width shown answers a switch with what it shows.
    if (message.type === 'ready') options?.control.frameReady(frame, message.choice);
    else if (message.type === 'shown' && frame === current) {
      options?.control.frameShown(message.choice);
    }
    if (isCanvasFrame(message)) {
      canvas?.hear(frame, message);
      return;
    }
    if (isEditFrameMessage(message)) {
      // Every width card is the version shown; the bridge tells them apart by channel.
      if (frame.role === 'current') editor?.receive(message);
      return;
    }
    if (isLiveFrame(message)) {
      editor?.receiveLive(frame, message);
      return;
    }
    if (extras.includes(frame)) {
      // A width card: it shows the page's state, and the findings stay with the width shown.
      if (message.type !== 'ready') return;
      frame.ready = true;
      canvas?.frameReady(frame);
      if (message.state !== page.state) sendState(frame, page.state);
      return;
    }
    if (message.type === 'ready') {
      canvas?.frameReady(frame);
      onReady(page, frame);
    } else if (message.type === 'shown') onShown(page, frame, message.state);
    // `example` comes only from the kit page's frames; a draft frame has no use for it.
    else if (message.type === 'elements') onElements(page, frame, message.request, message.items);
  });
  // Stage 4c: the full check after Save swaps the Checks pane in, and an accepted finding moves
  // its row's `data-element` aside (`edit/waivers.ts`): the marks follow both.
  page.main.addEventListener(CHECKS_SWAPPED_EVENT, () => setTimeout(() => refreshMarks(page), 0));
  new MutationObserver(() => refreshMarks(page)).observe(page.main, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-element'],
  });
  // On `document`, so the controls and notes put in by a switch need no new listeners.
  document.addEventListener('click', (event) => onClick(page, event));
  measure(page);
}
