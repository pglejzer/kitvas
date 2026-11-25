// The live loop on the draft page (plan 13, task E). `source` events keep the editor's ETags and
// change list current and notice when Claude started a new version; a finished build is shown in
// every width card, so the editor carries on (selection, history, panels) while the page itself
// never reloads. A card whose frame already shows that version takes the build in place (`swap`,
// ADR 0058): its document, scroll and overlays stay. Any other card, and one that cannot take it,
// loads its frame again at that version. Each card is on its own channel, and `builds` goes up
// once, when all of them show the build. The decisions are in `createLiveFrame`, over injected
// ports, so they are tested without a browser; `watchSources` wires them to the page.

import type {
  BuildEvent,
  EditState,
  SourceEvent,
} from '../../../../src/studio/api/edit/edit-schemas.ts';
import { type Scroll, type SwapStep, withScroll } from '../../../channel/protocol.ts';
import { type Frame, frameMessage, sendSwap } from '../../frames.ts';
import { buildOf, sourceOf } from '../../live/job-events.ts';
import { onStudioEvent } from '../../live/live.ts';
import type { StreamEvent } from '../../live/sse.ts';
import { type Answer, getEditState } from '../api.ts';
import type { EditorContext } from '../context.ts';
import type { ChangeEntry, EditorState } from '../store.ts';
import { text } from '../texts.ts';

/** A build that ended while another change was on its way waits this long for the next build. */
export const WAIT_FOR_NEXT_MS = 3_000;

/**
 * A card asked to take a build in place has this long to answer. After it the frame is loaded
 * again: a frame runtime older than the swap never answers.
 */
export const SWAP_ANSWER_MS = 5_000;

/** `/f/<key>/<slug>/v<n>/html/index.html`: the address of a draft's frame (src/studio/frame). */
const FRAME_PATH = /^(\/f\/[^/]+\/[^/]+\/)v[1-9][0-9]{0,5}(\/.*)$/;

/**
 * The frame's address for `version`, from the address it has now: the same origin, key and
 * channel, the state the page shows, and a fresh `live` number so that the same version loads
 * again. `undefined` for an address that is no draft frame's.
 */
export function frameAddress(
  current: string,
  next: { version: number; state: string | undefined; live: number },
): string | undefined {
  let url: URL;
  try {
    url = new URL(current);
  } catch {
    return undefined;
  }
  const match = FRAME_PATH.exec(url.pathname);
  if (!match) return undefined;
  url.pathname = `${match[1] ?? ''}v${next.version}${match[2] ?? ''}`;
  if (next.state) url.searchParams.set('state', next.state);
  url.searchParams.set('live', String(next.live));
  return url.href;
}

/**
 * Whether the frame at `current` already shows the page `next` names: the same origin, key, draft
 * and version, whatever their queries and channels say. Only then can it take a build in place.
 */
export function samePage(current: string, next: string): boolean {
  try {
    const from = new URL(current);
    const to = new URL(next);
    return from.origin === to.origin && from.pathname === to.pathname;
  } catch {
    return false;
  }
}

/** The page's address with `version` in it; the same when it names none (it shows the latest). */
export function pageAddress(current: string, version: number): string {
  const url = new URL(current);
  if (!url.searchParams.has('version')) return current;
  url.searchParams.set('version', String(version));
  return url.href;
}

/**
 * The frame address the studio serves now, with the channel the page and the frame already talk
 * on (the end of `current`). `undefined` when either is no address.
 */
export function withHashOf(served: string, current: string): string | undefined {
  try {
    const url = new URL(served);
    url.hash = new URL(current).hash;
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * `address` with the frame hash's scroll set to `scroll`, so a page loaded again opens there. The
 * same address when its hash is no frame hash.
 */
export function withScrollAt(address: string, scroll: Scroll): string {
  try {
    const url = new URL(address);
    url.hash = withScroll(url.hash, scroll);
    return url.href;
  } catch {
    return address;
  }
}

/** The page's side of the loop, replaceable in tests. */
export type LiveFrameIo = {
  getEditState(slug: string): Promise<Answer<EditState>>;
  /** Calls `fn` once after `ms`; the function it returns cancels that call. */
  after(ms: number, fn: () => void): () => void;
  now(): number;
  /** The page's address now. */
  page(): string;
  /** Puts another address into the page's history entry, without loading it. */
  replacePage(href: string): void;
  /** The current frame's address as the studio frames it now: after a restart its key is new. */
  servedFrame(): Promise<string | undefined>;
  /** The change list's text for a change Claude made. */
  claudeLabel(): string;
  /** Asks a card's frame to take build `live` into the page it shows (`sendSwap`). */
  swap(frame: Frame, live: number): void;
};

export type LiveFrameDeps = Pick<EditorContext, 'slug' | 'store' | 'bridge'> & {
  /** `main.draft-page`: `data-state` is the state shown, `data-version` the version framed. */
  main: Pick<HTMLElement, 'dataset'>;
};

export type LiveFrame = {
  /** Every event of the page's stream. */
  hear(event: StreamEvent): void;
  /**
   * A card's frame said `ready`; the edit card's when none is named. `live` is the build a swap
   * put into its page, absent when the frame loaded.
   */
  ready(frame?: Frame, live?: number): void;
  /**
   * A card's frame answered a swap whose build is not in its page. `scroll` is where it was
   * scrolled, sent with `failed`: the page loaded again opens there.
   */
  swapped(frame: Frame, live: number, step: SwapStep, scroll?: Scroll): void;
};

/** A swap a card was asked for: the build, and where its frame goes when it cannot take it. */
type Asked = { live: number; version: number; address: string };

export function createLiveFrame(deps: LiveFrameDeps, io: LiveFrameIo): LiveFrame {
  const { slug, store, bridge, main } = deps;
  /** This draft's `source` events since its last `build` event: each one asked for a build. */
  let sources = 0;
  /** A finished build that waits for the next one, so the frame loads once, not twice. */
  let waiting: { version: number; cancel: () => void } | null = null;
  let loads = 0;
  /** The cards that do not show the build yet: sent to a new address, or asked to take it. */
  let loading = new Set<Frame>();
  /** The cards asked to take the build in place, each with the way to stop waiting for it. */
  const swapping = new Map<Frame, Asked & { cancel: () => void }>();
  /** The newest version an event named. */
  let heard = 0;
  /** A newer version was heard while an edit was on its way. */
  let recheck = false;
  let reads = 0;

  async function readState(): Promise<void> {
    const mine = ++reads;
    const answer = await io.getEditState(slug);
    if (mine !== reads || !answer.ok) return;
    const before = store.get().edit?.version ?? answer.body.version;
    // A session that ended takes its undo steps along, as "Save version" does.
    const ended = answer.body.version > before ? { undo: [], redo: [] } : {};
    store.set({ edit: answer.body, etags: answer.body.etags, ...ended });
  }

  /** A version newer than the editor's: Claude started one, which ends the session. */
  function newer(version: number): void {
    heard = Math.max(heard, version);
    // The first edit of a session also lands in a newer version; its answer moves the editor.
    if (store.get().busy) {
      recheck = true;
      return;
    }
    void readState();
  }

  store.subscribe((state, previous) => {
    if (!recheck || state.busy || !previous.busy) return;
    recheck = false;
    if ((state.edit?.version ?? 0) < heard) void readState();
  });

  const claudeChange = (files: string[]): ChangeEntry => ({
    by: 'claude',
    id: null,
    label: io.claudeLabel(),
    files,
    offKit: false,
    at: io.now(),
  });

  function onSource(source: SourceEvent): void {
    sources += 1;
    const state = store.get();
    const shown = state.edit?.version;
    if (shown === undefined || source.version < shown) return;
    const names = Object.keys(source.files);
    const patch: Partial<EditorState> = {};
    // ETags of another version are not the ones the editor's requests name.
    if (
      source.version === shown &&
      names.some((path) => state.etags[path] !== source.files[path])
    ) {
      patch.etags = { ...state.etags, ...source.files };
    }
    if (source.by === 'other' && names.length > 0) {
      patch.changes = [...state.changes, claudeChange(names)];
    }
    if (Object.keys(patch).length > 0) store.set(patch);
    if (source.version > shown) newer(source.version);
  }

  function stopWaiting(): void {
    waiting?.cancel();
    waiting = null;
  }

  function waitForNext(version: number): void {
    stopWaiting();
    const cancel = io.after(WAIT_FOR_NEXT_MS, () => {
      waiting = null;
      load(version);
    });
    waiting = { version, cancel };
  }

  /** Loads a card's frame at `address`: a new document, which says `ready` when it is there. */
  function navigate(frame: Frame, address: string): void {
    frame.ready = false;
    frame.element.src = address;
  }

  /** No answer is waited for from this card's swap; what it was asked for, if anything. */
  function forget(frame: Frame): Asked | undefined {
    const asked = swapping.get(frame);
    asked?.cancel();
    swapping.delete(frame);
    return asked;
  }

  /**
   * A card that cannot take its build in place loads it. Not when its frame was sent to another
   * page meanwhile (an older version in the timeline): that page says `ready` on its own.
   */
  function plainly(frame: Frame, asked: Asked, scroll?: Scroll): void {
    if (!samePage(frame.element.src, asked.address)) return;
    navigate(frame, scroll ? withScrollAt(asked.address, scroll) : asked.address);
  }

  function ask(frame: Frame, asked: Asked): void {
    forget(frame);
    const cancel = io.after(SWAP_ANSWER_MS, () => {
      swapping.delete(frame);
      plainly(frame, asked);
    });
    swapping.set(frame, { ...asked, cancel });
    io.swap(frame, asked.live);
  }

  /**
   * Shows the build of `version` in every card; the page itself stays. A card that answers and
   * already shows that page takes the build in place, every other one loads its frame again.
   * `from` gives a card's address to start from, its own by default; each card keeps its channel.
   */
  function load(version: number, from?: (frame: Frame) => string | undefined): void {
    stopWaiting();
    loads += 1;
    const live = loads;
    const next = { version, state: main.dataset.state, live };
    const moves: [Frame, string][] = [];
    for (const frame of bridge.frames()) {
      const address = frameAddress(from?.(frame) ?? frame.element.src, next);
      if (address !== undefined) moves.push([frame, address]);
    }
    if (moves.length === 0) return;
    if (main.dataset.version !== String(version)) {
      // The first edit of a session started this version: the address names it from now on.
      main.dataset.version = String(version);
      io.replacePage(pageAddress(io.page(), version));
    }
    // An answer to an older build is no longer waited for.
    for (const frame of [...swapping.keys()]) forget(frame);
    loading = new Set(moves.map(([frame]) => frame));
    for (const [frame, address] of moves) {
      const inPlace = frame.ready && samePage(frame.element.src, address);
      if (inPlace) ask(frame, { live, version, address });
      else navigate(frame, address);
    }
  }

  function onBuild(build: BuildEvent): void {
    const state = store.get();
    // Another change is on its way when more than one asked for a build, or an edit is.
    const more = sources > 1 || state.busy;
    sources = 0;
    if (state.edit && build.version > state.edit.version) newer(build.version);
    if (!state.on) {
      // Not editing: the page loads itself again (`live.ts`).
      stopWaiting();
      return;
    }
    if (build.state === 'failed') {
      // The last good build is still there; one that waited for this build shows now.
      if (waiting) load(waiting.version);
      return;
    }
    if (more) waitForNext(build.version);
    else load(build.version);
  }

  /** Events were missed, or the studio started again (then the frame's key is new). */
  async function onReset(): Promise<void> {
    sources = 0;
    if (!store.get().on) return;
    await readState();
    const version = store.get().edit?.version;
    if (version === undefined) return;
    const served = await io.servedFrame();
    // Every card shows the address served now, each with its own channel.
    load(version, (frame) =>
      served === undefined ? undefined : withHashOf(served, frame.element.src),
    );
  }

  return {
    hear(event) {
      if (event.event === 'reset') {
        void onReset();
        return;
      }
      const source = sourceOf(event);
      if (source) {
        if (source.slug === slug) onSource(source);
        return;
      }
      const build = buildOf(event);
      if (build && build.slug === slug) onBuild(build);
    },
    ready(frame = bridge.frame, live) {
      const asked = swapping.get(frame);
      // The answer to an older swap, or to one no longer waited for: not the build asked for.
      if (live !== undefined && live !== asked?.live) return;
      // Without a build number the frame loaded: it shows the build on disk, however it came.
      forget(frame);
      if (!loading.delete(frame)) return;
      // A card removed meanwhile never says `ready`; the others need not wait for it.
      const cards = bridge.frames();
      for (const one of [...loading]) {
        if (cards.includes(one)) continue;
        loading.delete(one);
        forget(one);
      }
      if (loading.size > 0) return;
      store.set({ builds: store.get().builds + 1 });
      const { on, selection } = store.get();
      if (!on) return;
      // The page in the frame is a new render: edit mode, the outlines and the tree again.
      bridge.send({ type: 'edit', on: true });
      if (selection.length > 0) bridge.send({ type: 'select', ids: selection });
      bridge.send({ type: 'tree', request: bridge.nextRequest() });
    },
    swapped(frame, live, step, scroll) {
      const asked = swapping.get(frame);
      // The answer to an older swap, or to one no longer waited for.
      if (!asked || asked.live !== live) return;
      if (step === 'held') {
        // A gesture runs in the card. It says `free` when that ends, however long it takes.
        asked.cancel();
        return;
      }
      forget(frame);
      if (step === 'failed') {
        plainly(frame, asked, scroll);
        return;
      }
      // `free`: the gesture ended. A change it made is on its way, and that build is the one to
      // show; without one this build is asked for again.
      if (sources > 0 || store.get().busy) waitForNext(asked.version);
      else ask(frame, asked);
    },
  };
}

/** The draft page's frame address as the studio serves it now, read from a fresh page. */
async function servedFrame(): Promise<string | undefined> {
  try {
    const response = await fetch(location.href, {
      credentials: 'same-origin',
      headers: { accept: 'text/html' },
    });
    if (!response.ok) return undefined;
    // Inert markup: a template's content runs and applies nothing.
    const template = document.createElement('template');
    template.innerHTML = await response.text();
    const frame = template.content.querySelector('iframe[data-frame="current"]');
    return frame?.getAttribute('src') ?? undefined;
  } catch {
    return undefined;
  }
}

const pageIo: LiveFrameIo = {
  getEditState,
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  now: () => Date.now(),
  page: () => location.href,
  replacePage: (href) => history.replaceState(history.state, '', href),
  servedFrame,
  claudeLabel: () => text('live.changed'),
  swap: sendSwap,
};

export function watchSources(ctx: EditorContext): void {
  const live = createLiveFrame(ctx, pageIo);
  onStudioEvent((event) => live.hear(event));
  window.addEventListener('message', (event) => {
    const heard = frameMessage(ctx.bridge.frames(), event);
    if (!heard) return;
    const { frame, message } = heard;
    if (message.type === 'ready') live.ready(frame, message.live);
    else if (message.type === 'swap')
      live.swapped(frame, message.live, message.step, message.scroll);
  });
}
