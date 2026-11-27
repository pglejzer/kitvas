// The lenses on the draft page (redesign spec, goal 9; plan 19, task 1): the pill at the canvas's
// top left, the pins the lens that is on sends every card, and a click on a pin. One lens at a time
// (`lens.ts`), starting at Design on every page load; a lens changes only what the frames draw over
// the draft, so no frame loads again and nothing in the page moves. Design, Checks and Why work in
// Preview and Edit; Kit and Changes need Edit, and leaving Edit on one of them goes back to Design.
//
// The pins are built again on a lens change, a build, a change of the draft's files, of the
// findings, of the live findings, of the session's changes or of the Why report, and a card that
// loaded or took a build in place is sent them again. The Kit lens's data is read when it goes on
// and again after the files change, never while another lens is on; the Why report when Why goes
// on and again after a request or a build. Called by the draft page's script (`draft/page.ts`),
// with the editor's store when the version can be edited.

import type { LensPin } from '../../channel/lens-protocol.ts';
import { liveGroups } from '../edit/live/items.ts';
import type { EditorState, Store } from '../edit/store.ts';
import { getWhy } from '../edit/why/api.ts';
import type { WhyReport } from '../edit/why/entries.ts';
import { type Frame, frameMessage, lensMessage } from '../frames.ts';
import { getKitLens, type KitLens } from './kit-api.ts';
import { lens, lensAllowed } from './lens.ts';
import { openPin } from './open.ts';
import { mountPill } from './pill.ts';
import { readFindings } from './pins/checks.ts';
import { kitPins } from './pins/kit.ts';
import {
  capPins,
  cleanPins,
  createSender,
  type LensSources,
  lensCounts,
  lensPins,
} from './send.ts';

/** What the lenses need of the draft page (`draft/page.ts` makes it). */
export type LensPage = {
  /** `main.draft-page`: the pill's host, the findings and the panes are in it. */
  main: HTMLElement;
  /** The cards that draw pins: the width shown and the width cards; never a compared version. */
  frames(): Frame[];
  /** A card's width in CSS pixels, as its frame is sized now. */
  widthOf(frame: Frame): number;
  /** The full check's marks are hidden: at a width that is no preset, or while its findings come. */
  findingsHidden(): boolean;
  /** Hears the findings, the width, the diff or the cards change. Returns the way to stop. */
  onChange(listener: () => void): () => void;
};

/** What of the editor's state the pins are built from: a change of any builds them again. */
const READ: readonly (keyof EditorState)[] = [
  'on',
  'live',
  'waivers',
  'changes',
  'structure',
  'edit',
  'etags',
  'builds',
];

/** A read whose answer may come after a newer one was asked: only the newest answer counts. */
function latest<T>(read: () => Promise<T>, take: (answer: T) => void): () => void {
  let asked = 0;
  return () => {
    asked += 1;
    const mine = asked;
    void read().then((answer) => {
      if (mine === asked) take(answer);
    });
  };
}

export function mountLens(store: Store | null, page: LensPage): void {
  const host = page.main.querySelector<HTMLElement>('[data-lens-pill]');
  if (!host) return;
  const slug = page.main.dataset.draft ?? '';
  const sender = createSender();
  /** The pins sent last, by key: a click names one. */
  let shown = new Map<string, LensPin>();
  let kit: KitLens | null = null;
  let why: WhyReport | null = null;
  /** The Why report changed (a request, a build) since it was read. */
  let whyStale = true;
  let queued = false;

  const editing = (): boolean => store?.get().on === true;

  const pill = mountPill(host, (next) => {
    if (lensAllowed(next, editing())) lens.set(next);
  });

  function build(): void {
    queued = false;
    const state = store?.get();
    const on = editing();
    const now = lens.get();
    const listed = readFindings(page.main);
    // The live findings are the editor's, and show in Edit only (as their tags did).
    const live = state && on ? liveGroups(state.live, state.waivers) : [];
    const changes = state?.changes ?? [];
    const sources: LensSources = {
      findings: page.findingsHidden() ? [] : listed,
      live,
      why,
      sections: state?.structure?.sections ?? [],
      changes,
      kit: now === 'kit' ? kitPins(kit, state?.edit?.tokens ?? []) : [],
    };
    const next = new Map<string, LensPin>();
    let left = 0;
    for (const frame of page.frames()) {
      const built = lensPins(now, on, sources, page.widthOf(frame));
      const capped = capPins(cleanPins(built));
      left = Math.max(left, capped.left);
      for (const pin of capped.pins) next.set(pin.key, pin);
      sender.send(frame, capped.pins);
    }
    shown = next;
    const counts = lensCounts({ findings: listed, live, changes });
    pill.render({ lens: now, editing: on, counts, left });
  }

  /** One build for everything that changed in one task. */
  function schedule(): void {
    if (queued) return;
    queued = true;
    queueMicrotask(build);
  }

  const readKit = latest(
    () => getKitLens(slug),
    (report) => {
      kit = report;
      schedule();
    },
  );
  const readWhy = latest(
    () => getWhy(slug),
    (report) => {
      // A read that failed keeps the report before it, and is tried again the next time.
      if (report) why = report;
      else whyStale = true;
      schedule();
    },
  );

  /** The Why report, read again only when it may have changed since the last read. */
  function readWhyIfStale(): void {
    if (!whyStale) return;
    whyStale = false;
    readWhy();
  }

  lens.subscribe((now) => {
    // The Kit lens's data is read each time it goes on: the files may have changed meanwhile.
    if (now === 'kit' && store !== null) readKit();
    if (now === 'why') readWhyIfStale();
    schedule();
  });

  store?.subscribe((state, previous) => {
    // Kit and Changes need Edit: leaving it on one of them goes back to Design.
    if (!state.on && previous.on && !lensAllowed(lens.get(), false)) lens.set('design');
    const now = lens.get();
    const built = state.builds !== previous.builds;
    if (now === 'kit' && (built || state.etags !== previous.etags)) readKit();
    // Claude answers a `why` request by writing the files; a build follows a new version.
    if (built || state.requests !== previous.requests) {
      whyStale = true;
      if (now === 'why') readWhyIfStale();
    }
    if (READ.some((key) => state[key] !== previous[key])) schedule();
  });

  page.onChange(schedule);

  window.addEventListener('message', (event) => {
    const frames = page.frames();
    const click = lensMessage(frames, event);
    if (click) {
      const pin = shown.get(click.message.key);
      if (pin) openPin(page.main, store, pin);
      return;
    }
    // A card that loaded, or took a build in place, is told its pins again.
    const heard = frameMessage(frames, event);
    if (heard?.message.type === 'ready') {
      sender.forget(heard.frame);
      schedule();
    }
  });

  // The pill is drawn at once: the fit of the canvas's bars measures it in this same task.
  build();
}
