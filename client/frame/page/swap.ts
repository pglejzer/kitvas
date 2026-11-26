// A build taken into the page a frame already shows (ADR 0058). After an edit the studio asks for
// the new build with `swap`. The frame loads the new sheet beside the old one, without applying
// it, and runs the new bundle as one more script of the same document. That bundle's entry finds
// the runtime that already runs the page (`running`) and only hands itself over. Then, in one
// step, the old render leaves, the new sheet takes over and the new render shows: the document,
// its scroll and every overlay stay, and nothing is painted in between.
//
// The steps and their rules are in `createSwap`, over injected ports, so they are tested without a
// browser; `pagePorts` is the DOM around them.

import type { DraftOption, OptionChoice } from '../../../src/shared/values/options.ts';
import type { Scroll, SwapStep } from '../../channel/protocol.ts';
import { idle } from './busy.ts';
import type { ThemeAttributes } from './theme-body.ts';

/** A draft rendered into `#root` by one bundle's own React. */
export type Mounted = {
  /** Renders one state with the values of the options; when it returns, they are in the DOM. */
  render(state: string, choice: OptionChoice): void;
  /** Takes the draft out of the page; when it returns, `#root` is empty. */
  unmount(): void;
};

/** What a bundle's entry hands the frame runtime (`src/render/domain/mount.ts`). */
export type Bundle = {
  states: string[];
  /** The version's options; `[]` for none. */
  options: DraftOption[];
  /** What each theme sets on the body (ADR 0083); left out by a build that has no such theme. */
  themes?: ThemeAttributes;
  initial: string;
  /** Makes a fresh root on `#root`. */
  mount(): Mounted;
  /** A stamp of the frame runtime the bundle was built with; it changes whenever the runtime does. */
  runtime: string;
};

/**
 * A sheet or a bundle that has not come after this long is given up. The two together stay under
 * the time the studio waits for an answer (`SWAP_ANSWER_MS`, `client/studio/edit/sync`), so a frame
 * that fails says so before the studio stops listening.
 */
export const SWAP_TIMEOUT_MS = 2_000;

/**
 * The builds one document takes in place. Each bundle brings its own React, and an unmounted root
 * leaves its listeners on `#root` and on the document: they keep the whole bundle in memory and
 * still hear every event. After this many the frame answers `failed`, so the page is loaded again
 * and all of them are freed.
 */
export const MAX_SWAPS = 40;

type Hand = (bundle: Bundle) => void;
type Scope = { __KITVAS_FRAME__?: Hand };

/** The way to hand a bundle to the runtime that already runs this document; none in a fresh one. */
export function running(scope: Scope = globalThis as Scope): Hand | undefined {
  const hand = scope.__KITVAS_FRAME__;
  return typeof hand === 'function' ? hand : undefined;
}

/** The first runtime of a document leaves `hand` for the bundles that run in it later. */
export function register(hand: Hand, scope: Scope = globalThis as Scope): void {
  scope.__KITVAS_FRAME__ = hand;
}

/** A sheet loaded beside the one in use, which does not apply yet. */
export type Staged = {
  /** `true` once it has loaded, `false` when it cannot. */
  loaded: Promise<boolean>;
  /** It applies from now on, and the sheets it replaces leave. */
  use(): void;
  /** Takes it away unless it is in use; the page keeps the sheet it has. */
  drop(): void;
};

/** What a swap needs of the page; `pagePorts` is the real one, a test passes fakes. */
export type SwapPage = {
  /** Resolves once no gesture runs; settled already when none does (`busy.ts`). */
  idle(): Promise<void>;
  /** Starts loading the sheet of build `live`. */
  sheet(live: number): Staged;
  /** Runs the bundle of build `live`; settles when the script ran, or could not be loaded. */
  script(live: number): Promise<void>;
  /** Calls `fn` once after `ms`; the function it returns cancels that call. */
  after(ms: number, fn: () => void): () => void;
};

export type SwapDeps = {
  page: SwapPage;
  /** The stamp of the runtime that runs this document. */
  runtime: string;
  /**
   * Puts `bundle` in the place of the render shown, and calls `sheet.use()` between the two. It
   * throws when it cannot.
   */
  take(bundle: Bundle, sheet: Staged): void;
  /** How far the page is scrolled now. */
  scroll(): Scroll;
  /** Tells the studio where the swap of build `live` is; `failed` carries the page's scroll. */
  answer(live: number, step: SwapStep | 'ready', scroll?: Scroll): void;
};

export type Swap = {
  /** The studio asked for build `live`. One asked for while another is taken replaces it. */
  ask(live: number): void;
  /** A bundle that ran in this document handed itself over. */
  hand(bundle: Bundle): void;
};

/** How one build ended; `null` when a newer one was asked for meanwhile, so it has no answer. */
type Ended = SwapStep | 'ready' | null;

/**
 * Whether `promise` is settled already. The reaction of a settled promise is queued at once, so
 * it runs before the one queued after it here.
 */
function settled(promise: Promise<void>): Promise<boolean> {
  const seen = { done: false };
  const mark = (): void => {
    seen.done = true;
  };
  promise.then(mark, mark);
  return Promise.resolve().then(() => seen.done);
}

export function createSwap({ page, runtime, take, scroll, answer }: SwapDeps): Swap {
  /** A build is being taken. */
  let busy = false;
  /** The build asked for while another was being taken: it comes next. */
  let next: number | null = null;
  /** The swap waits for a gesture to end. */
  let holding = false;
  /** Where the bundle of the script that runs now goes. */
  let receive: Hand | null = null;
  let taken = 0;

  const replaced = (): boolean => next !== null;

  /** `work`, or `late` when it has not settled in time. */
  function inTime<T>(work: Promise<T>, late: T): Promise<T> {
    return new Promise((resolve) => {
      const cancel = page.after(SWAP_TIMEOUT_MS, () => resolve(late));
      const end = (value: T): void => {
        cancel();
        resolve(value);
      };
      work.then(end, () => end(late));
    });
  }

  /** The bundle the script of build `live` hands over; `null` when it ran and handed none. */
  function bundleOf(live: number): Promise<Bundle | null> {
    return new Promise((resolve) => {
      const end = (bundle: Bundle | null): void => {
        if (receive === end) receive = null;
        resolve(bundle);
      };
      receive = end;
      // The entry hands the bundle over while its script runs: none by its end means none at all.
      const ran = (): void => end(null);
      page.script(live).then(ran, ran);
    });
  }

  /** Waits for the gesture that runs now and tells the studio of it; `false` when none runs. */
  async function gesture(live: number): Promise<boolean> {
    const free = page.idle();
    if (await settled(free)) return false;
    answer(live, 'held');
    holding = true;
    await free;
    holding = false;
    return true;
  }

  /** The steps from a loaded sheet to the new render. The caller drops a sheet that was not used. */
  async function stage(live: number, sheet: Staged): Promise<Ended> {
    if (!(await inTime(sheet.loaded, false))) return 'failed';
    if (replaced()) return null;
    const bundle = await inTime(bundleOf(live), null);
    // A script that ends later than that hands its bundle to nobody.
    receive = null;
    if (replaced()) return null;
    // Another runtime made that bundle: this page's overlays and messages are not its own.
    if (!bundle || bundle.runtime !== runtime) return 'failed';
    // A gesture that began while the build loaded.
    if (await gesture(live)) return 'free';
    try {
      take(bundle, sheet);
    } catch {
      return 'failed';
    }
    taken += 1;
    return 'ready';
  }

  async function attempt(live: number): Promise<Ended> {
    // Nothing is loaded, and no page is given up, under a gesture.
    if (await gesture(live)) return 'free';
    if (taken >= MAX_SWAPS) return 'failed';
    const sheet = page.sheet(live);
    const ended = await stage(live, sheet);
    if (ended !== 'ready') sheet.drop();
    return ended;
  }

  async function run(first: number): Promise<void> {
    busy = true;
    let live = first;
    for (;;) {
      const ended = await attempt(live).catch((): Ended => 'failed');
      const newer = next;
      next = null;
      if (ended === 'free') {
        // A gesture ended, and it may have made a change of its own. The studio decides what the
        // page takes now: the newest build it asked for is the one that is free.
        busy = false;
        answer(newer ?? live, 'free');
        return;
      }
      if (newer === null) {
        busy = false;
        if (ended === 'failed') answer(live, ended, scroll());
        else if (ended !== null) answer(live, ended);
        return;
      }
      live = newer;
    }
  }

  return {
    ask(live) {
      if (!busy) {
        void run(live);
        return;
      }
      next = live;
      // The studio stops waiting for this one too until the gesture ends.
      if (holding) answer(live, 'held');
    },
    hand(bundle) {
      // A bundle nobody waits for is dropped: its script ran for nothing.
      receive?.(bundle);
    },
  };
}

const SHEET = '../css/index.css';
const SCRIPT = '../js/index.js';

/** Whether two addresses name one file, whatever their queries and hashes say. */
export function sameFile(one: string, other: string): boolean {
  try {
    const a = new URL(one);
    const b = new URL(other);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function stageSheet(live: number): Staged {
  const href = new URL(`${SHEET}?live=${live}`, location.href).href;
  /** The page's sheet and every copy of it, in the document's order. */
  const sheets = (): HTMLLinkElement[] =>
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter((one) =>
      sameFile(one.href, href),
    );
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // Readable by the frame's own scripts: the forced-state twins are made from its rules
  // (`live/force.ts`), with no copy of it.
  link.crossOrigin = 'anonymous';
  // Loaded now, applied only when the new render is there to show with it.
  link.media = 'not all';
  const loaded = new Promise<boolean>((resolve) => {
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => resolve(false), { once: true });
  });
  link.href = href;
  // Right after the sheet in use, so its place among the page's other styles stays.
  const [current] = sheets();
  if (current) current.after(link);
  else document.head.append(link);
  let used = false;
  return {
    loaded,
    use() {
      used = true;
      link.media = 'all';
      for (const old of sheets()) if (old !== link) old.remove();
    },
    drop() {
      if (!used) link.remove();
    },
  };
}

function runScript(live: number): Promise<void> {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    const end = (): void => {
      script.remove();
      resolve();
    };
    script.addEventListener('load', end, { once: true });
    script.addEventListener('error', end, { once: true });
    script.src = `${SCRIPT}?live=${live}`;
    document.head.append(script);
  });
}

/** The page's own sheet and script, loaded the way its HTML names them (`../css`, `../js`). */
export function pagePorts(): SwapPage {
  return {
    idle,
    sheet: stageSheet,
    script: runScript,
    after: (ms, fn) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },
  };
}
