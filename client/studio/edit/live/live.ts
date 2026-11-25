// Live checks on the draft page (spec 4c, goals 5, 7 and 8; plan 16, task C). After an applied
// edit, undo or redo, once the cards show its build, every card measures the changed elements and
// the ones with findings already (`live-loop.ts` says when: debounced, never during a drag or
// typing); the edit card also holds the build against what the editor showed. The answers and
// the server's code findings of the changed files become `store.live`; the screen gets its Live
// section and the selected element's card (`live-view.ts`). On the cards they are the Checks
// lens's pins (plan 19, `client/studio/lens/`), so no numbered live tag is sent any more.
// "Save version" starts the full check, whose result replaces the Checks pane (`live-check.ts`).

import {
  type Expected,
  type LiveFrameMessage,
  MAX_LIVE_IDS,
} from '../../../channel/live-protocol.ts';
import { onStudioEvent } from '../../live/live.ts';
import { mountCheckCards } from '../checks/cards.ts';
import type { EditorContext } from '../context.ts';
import type { EditorState, LiveItem } from '../store.ts';
import {
  createFullCheck,
  FULL_CHECK_EVENT,
  type FullCheckStatus,
  postCheck,
  swapChecks,
} from './check.ts';
import {
  changedFiles,
  coveredIds,
  expectations,
  joinExpectations,
  liveGroups,
  sentOps,
  topsOf,
  withCodeAnswer,
  withFrameAnswer,
} from './items.ts';
import { createLiveLoop, type LoopIo } from './loop.ts';
import { mountLiveView } from './view.ts';

type Facts = Extract<LiveFrameMessage, { type: 'live-facts' }>;
type Card = Extract<LiveFrameMessage, { type: 'a11y-card' }>;

const clock: LoopIo = {
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  now: () => Date.now(),
};

export function mountLive(ctx: EditorContext): void {
  const { store, bridge, main, slug } = ctx;
  const view = mountLiveView(ctx);
  let frameItems: LiveItem[] = [];
  /** The code findings of each file, as the latest request that wrote it answered them. */
  let code = new Map<string, LiveItem[]>();
  /** The stacks and ETags when the request on its way started. */
  let tops = topsOf(store.get());
  let etags = store.get().etags;
  let startedAt = store.get().builds;
  /** What waits for the next build: the elements to measure, what the editor showed for them. */
  let waiting: string[] = [];
  let expect: Expected[] = [];
  let round: { request: number; named: string[] } | null = null;
  let cardRequest = -1;
  let status: FullCheckStatus = 'idle';
  /** The applied count when "Save version" asked for the full check. */
  let savedAt = -1;

  const publish = (): void => {
    store.set({ live: [...frameItems, ...[...code.values()].flat()] });
  };

  function refresh(): void {
    const state = store.get();
    const groups = liveGroups(state.live, state.waivers);
    view.render({
      on: state.on,
      groups,
      selected: state.selection[0] ?? null,
      status,
    });
  }

  function measure(): void {
    if (!store.get().on) return;
    const known = frameItems.flatMap((item) => (item.id === null ? [] : [item.id]));
    const named = [...new Set([...waiting, ...known])].slice(0, MAX_LIVE_IDS);
    const shown = expect;
    waiting = [];
    expect = [];
    if (named.length === 0) return;
    const request = bridge.nextRequest();
    round = { request, named };
    const [edit, ...others] = bridge.frames();
    // Only the edit card is in the context the edits were made in (`expectations`).
    if (edit) bridge.sendLive({ type: 'measure-live', request, ids: named, expect: shown }, edit);
    for (const frame of others) {
      bridge.sendLive({ type: 'measure-live', request, ids: named, expect: [] }, frame);
    }
  }

  const loop = createLiveLoop(clock, { measure, worth: () => frameItems.length > 0 });

  function hearFacts(message: Facts): void {
    if (round === null || message.request !== round.request) return;
    const covered = coveredIds(round.named, store.get().tree, message.facts);
    frameItems = withFrameAnswer(frameItems, message, covered);
    publish();
  }

  function hearCard(message: Card): void {
    const state = store.get();
    if (message.request !== cardRequest || message.id !== state.selection[0]) return;
    store.set({ a11y: message.card });
  }

  /** The selected element's card, from the edit card; none while nothing is selected. */
  function askCard(): void {
    const state = store.get();
    const id = state.selection[0];
    const [edit] = bridge.frames();
    if (!state.on || id === undefined || !edit) {
      cardRequest = -1;
      if (state.a11y !== null) store.set({ a11y: null });
      return;
    }
    cardRequest = bridge.nextRequest();
    const { item } = state;
    bridge.sendLive(
      { type: 'a11y', request: cardRequest, id, ...(item === null ? {} : { item }) },
      edit,
    );
  }

  function onApplied(state: EditorState): void {
    const note = state.applied;
    if (note === null) return;
    const ops = sentOps(tops, topsOf(state));
    waiting = [...new Set([...waiting, ...note.ids])].slice(0, MAX_LIVE_IDS);
    expect = joinExpectations(expect, expectations(ops, state.context.width, state.context.state));
    code = withCodeAnswer(code, changedFiles(etags, state.etags), note.live);
    // A new change makes the last full check's word old.
    if (status !== 'running') status = 'idle';
    publish();
    // The build of the write may be shown before the answer came (the code checks take a moment).
    loop.applied(startedAt);
    if (state.builds > startedAt) loop.built(state.builds);
  }

  function onMode(state: EditorState): void {
    if (state.on) {
      askCard();
      return;
    }
    loop.stop();
    round = null;
    waiting = [];
    expect = [];
    if (state.a11y !== null) store.set({ a11y: null });
  }

  store.subscribe((state, previous) => {
    if (state.busy && !previous.busy) {
      tops = topsOf(state);
      etags = state.etags;
      startedAt = state.builds;
    }
    if (state.applied !== previous.applied) onApplied(state);
    if (state.builds !== previous.builds) {
      loop.built(state.builds);
      // The card is read again from the page the cards show now.
      askCard();
    }
    if (state.on !== previous.on) onMode(state);
    else if (state.selection[0] !== previous.selection[0]) {
      if (state.a11y !== null) store.set({ a11y: null });
      askCard();
    } else if (state.item !== previous.item) {
      // Another copy of the same element: its card is read again.
      askCard();
    }
    const shown =
      state.live !== previous.live ||
      state.waivers !== previous.waivers ||
      state.on !== previous.on ||
      state.selection !== previous.selection ||
      state.a11y !== previous.a11y;
    if (shown) refresh();
  });

  bridge.onLive((_frame, message) => {
    if (message.type === 'live-facts') hearFacts(message);
    else if (message.type === 'a11y-card') hearCard(message);
  });

  // A drag on the page or on a handle in a frame, and typing, hold the measuring back.
  document.addEventListener('pointerdown', () => loop.dragging(true), true);
  // A drag from the page into a frame ends in the frame (`drop`) or as a native drag (`dragend`).
  for (const type of ['pointerup', 'pointercancel', 'blur', 'dragend', 'drop'] as const) {
    window.addEventListener(type, () => loop.dragging(false), true);
  }
  document.addEventListener('keydown', () => loop.typed(), true);
  bridge.on((message) => {
    if (message.type === 'handle') loop.dragging(!message.done);
    else if (message.type === 'drop') loop.dragging(false);
  });

  // Smart validation: the full check after "Save version"; its result supersedes the live
  // findings when nothing was changed since the save.
  const fullCheck = createFullCheck(
    slug,
    { post: postCheck, swap: () => swapChecks(main) },
    (next) => {
      status = next;
      if (next === 'done' && (store.get().applied?.count ?? 0) === savedAt) {
        frameItems = [];
        code = new Map();
        publish();
      }
      refresh();
    },
  );
  main.addEventListener(FULL_CHECK_EVENT, () => {
    savedAt = store.get().applied?.count ?? 0;
    void fullCheck.start();
  });
  onStudioEvent((event) => fullCheck.hear(event));
  // The Checks pane's cards (evidence, Use <token>, Ask Claude) and its Run buttons.
  mountCheckCards(ctx);

  refresh();
}
