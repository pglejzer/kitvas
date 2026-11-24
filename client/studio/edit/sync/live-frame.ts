// The live loop on the draft page (plan 13, task E). `source` events keep the editor's ETags and
// change list current and notice when Claude started a new version; a finished build loads the
// frames again at that version, so the editor carries on (selection, history, panels) while the
// page itself never reloads. Stage 4c: every width card loads again, each on its own channel, and
// `builds` goes up once, when all of them are ready. The decisions are in `createLiveFrame`, over
// injected ports, so they are tested without a browser; `watchSources` wires them to the page.

import type {
  BuildEvent,
  EditState,
  SourceEvent,
} from '../../../../src/studio/api/edit/edit-schemas.ts';
import { type Frame, frameMessage } from '../../frames.ts';
import { buildOf, sourceOf } from '../../live/job-events.ts';
import { onStudioEvent } from '../../live/live.ts';
import type { StreamEvent } from '../../live/sse.ts';
import { type Answer, getEditState } from '../api.ts';
import type { EditorContext } from '../context.ts';
import type { ChangeEntry, EditorState } from '../store.ts';
import { text } from '../texts.ts';

/** A build that ended while another change was on its way waits this long for the next build. */
export const WAIT_FOR_NEXT_MS = 3_000;

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
};

export type LiveFrameDeps = Pick<EditorContext, 'slug' | 'store' | 'bridge'> & {
  /** `main.draft-page`: `data-state` is the state shown, `data-version` the version framed. */
  main: Pick<HTMLElement, 'dataset'>;
};

export type LiveFrame = {
  /** Every event of the page's stream. */
  hear(event: StreamEvent): void;
  /** A card's frame said `ready`; the edit card's when none is named. */
  ready(frame?: Frame): void;
};

export function createLiveFrame(deps: LiveFrameDeps, io: LiveFrameIo): LiveFrame {
  const { slug, store, bridge, main } = deps;
  /** This draft's `source` events since its last `build` event: each one asked for a build. */
  let sources = 0;
  /** A finished build that waits for the next one, so the frame loads once, not twice. */
  let waiting: { version: number; cancel: () => void } | null = null;
  let loads = 0;
  /** The cards sent to a new address that have not said `ready` yet. */
  let loading = new Set<Frame>();
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

  /**
   * Loads every card again at `version`; the page itself stays. `from` gives a card's address to
   * start from, its own by default; each card keeps its channel.
   */
  function load(version: number, from?: (frame: Frame) => string | undefined): void {
    stopWaiting();
    loads += 1;
    const next = { version, state: main.dataset.state, live: loads };
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
    loading = new Set(moves.map(([frame]) => frame));
    for (const [frame, address] of moves) {
      frame.ready = false;
      frame.element.src = address;
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
    // Every card loads the address served now, each with its own channel.
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
    ready(frame = bridge.frame) {
      if (!loading.delete(frame)) return;
      // A card removed while it loaded never says `ready`; the others need not wait for it.
      const cards = bridge.frames();
      for (const one of [...loading]) if (!cards.includes(one)) loading.delete(one);
      if (loading.size > 0) return;
      store.set({ builds: store.get().builds + 1 });
      const { on, selection } = store.get();
      if (!on) return;
      // A new page in the frame knows nothing yet: edit mode, the outlines and the tree again.
      bridge.send({ type: 'edit', on: true });
      if (selection.length > 0) bridge.send({ type: 'select', ids: selection });
      bridge.send({ type: 'tree', request: bridge.nextRequest() });
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
};

export function watchSources(ctx: EditorContext): void {
  const live = createLiveFrame(ctx, pageIo);
  onStudioEvent((event) => live.hear(event));
  window.addEventListener('message', (event) => {
    const heard = frameMessage(ctx.bridge.frames(), event);
    if (heard?.message.type === 'ready') live.ready(heard.frame);
  });
}
