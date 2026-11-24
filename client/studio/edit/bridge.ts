// The editor's line to the frames: messages out through `sendEdit` and `sendLive`, edit messages in
// from the draft page's one listener (client/studio/draft/page.ts), handed to every panel that
// listens.
//
// Stage 4c (spec goal 4): one editor over every width card. The selection, the hover, edit mode,
// the tree request, the forced state and the structure messages go to every card; `inspect` and
// `edit-text` go to the edit card, whose answers are the only ones heard. A pick (or any gesture)
// in another card makes that card the edit card first. A preview shows only in the cards it
// applies to: from the edit context's width up. A card that loads (a new card, or after a build)
// gets what the others were told last, so every card shows the same editor.

import type {
  EditFrameMessage,
  EditStudioBody,
  PreviewChange,
} from '../../channel/edit-protocol.ts';
import type { LiveFrameMessage, LiveStudioBody } from '../../channel/live-protocol.ts';
import { type CardSource, cardsOf } from '../canvas/card-list.ts';
import { type Frame, frameMessage, sendEdit, sendFlash, sendLive } from '../frames.ts';
import { previewApplies } from './style/context-rules.ts';

export type FrameListener = (message: EditFrameMessage) => void;
export type LiveListener = (frame: Frame, message: LiveFrameMessage) => void;

export type Bridge = {
  /** The edit card's frame: the card the person last worked in. */
  frame: Frame;
  send(body: EditStudioBody): void;
  /** Returns the way to stop listening. */
  on(listener: FrameListener): () => void;
  /** Called by the draft page for every edit message of a card's frame. */
  receive(message: EditFrameMessage): void;
  /** A fresh number for a `tree` or `inspect` request; an answer to an older one is dropped. */
  nextRequest(): number;
  // Stage 4c (plan 16, C5).
  /** Every card's frame, the edit card's first. */
  frames(): Frame[];
  /** A live message to one frame, or to every card's frame when `frame` is left out. */
  sendLive(body: LiveStudioBody, frame?: Frame): void;
  onLive(listener: LiveListener): () => void;
  /** Called by the draft page for every live message of a card's frame. */
  receiveLive(frame: Frame, message: LiveFrameMessage): void;
  // Optional, so a test's bridge without cards still is one.
  /** The width cards: their widths, the edit card, and a way to hear them change. */
  cards?: CardSource;
  /** The width the edit context applies from: `preview` goes to the cards from that width up. */
  setPreviewWidth?(width: number | null): void;
  /** A preview for one width context, whatever the context is now (an undo of an older edit). */
  sendPreview?(changes: PreviewChange[], width: number | null): void;
  /**
   * A ring flashes once on `ids` in every card: a change was just applied to them by a button
   * or a key (a variant, a suggestion, an undo, a redo), not by the person's hand on the element.
   */
  flash?(ids: readonly string[]): void;
};

/** What every card gets; the frame answers these to the edit card only. */
const BROADCAST = new Set([
  'edit',
  'select',
  'hover',
  'tree',
  'unpreview',
  'structure',
  'tokens',
  'hide',
  'lock',
  'handles',
]);

/** What a card that loads is told again, in this order: edit mode before what it draws. */
const REPLAYED = ['edit', 'structure', 'tokens', 'hide', 'lock', 'handles', 'select'] as const;

/** A gesture in a card: the card becomes the edit card before anyone hears it. */
const GESTURES = new Set(['pick', 'rect', 'menu', 'drop', 'handle']);

/** Heard from any card; everything else only from the edit card. */
const FROM_ANY = new Set(['hovered', 'key']);

/** The cards a body goes to: every card, the edit card, or the cards a preview applies to. */
export function targetsOf(
  body: EditStudioBody,
  cards: Pick<CardSource, 'frames' | 'edit' | 'widthOf'>,
  previewWidth: number | null,
): Frame[] {
  if (body.type === 'preview') {
    return cards.frames().filter((frame) => previewApplies(cards.widthOf(frame), previewWidth));
  }
  return BROADCAST.has(body.type) ? cards.frames() : [cards.edit()];
}

/**
 * Which card a frame message is from, and whether the panels hear it. A gesture moves the edit
 * card there first (`edit` is the new edit card); an answer of another card is dropped.
 */
export function heardFrom(
  message: Pick<EditFrameMessage, 'type' | 'channel'>,
  cards: Pick<CardSource, 'byChannel' | 'edit'>,
): { from: Frame | undefined; edit: Frame | undefined; heard: boolean } {
  const from = cards.byChannel(message.channel);
  // A message of no known card is the current frame's, as before the cards.
  if (!from) return { from, edit: undefined, heard: true };
  const edit = GESTURES.has(message.type) ? from : undefined;
  const heard = edit !== undefined || FROM_ANY.has(message.type) || from === cards.edit();
  return { from, edit, heard };
}

export function createBridge(lead: Frame, cards: CardSource = cardsOf(lead)): Bridge {
  const listeners = new Set<FrameListener>();
  const live = new Set<LiveListener>();
  /** The last body of each kind every card should know, for a card that loads. */
  const sticky = new Map<string, EditStudioBody>();
  let force: LiveStudioBody | null = null;
  let previewWidth: number | null = null;
  let requests = 0;

  function replay(frame: Frame): void {
    for (const type of REPLAYED) {
      const body = sticky.get(type);
      if (body) sendEdit(frame, body);
    }
    // A forced state only while editing: it never shows in Preview.
    const edit = sticky.get('edit');
    if (force && edit?.type === 'edit' && edit.on) sendLive(frame, force);
  }

  // A card that loads knows nothing: the frames say `ready` to the page, which every listener of
  // the window hears (as `live-frame.ts` and `structure.ts` do for the current frame).
  if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
      const heard = frameMessage(cards.frames(), event);
      if (heard?.message.type === 'ready') replay(heard.frame);
    });
  }

  const bridge: Bridge = {
    get frame() {
      return cards.edit();
    },
    send(body) {
      if (REPLAYED.some((type) => type === body.type)) sticky.set(body.type, body);
      for (const frame of targetsOf(body, cards, previewWidth)) sendEdit(frame, body);
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    receive(message) {
      const { edit, heard } = heardFrom(message, cards);
      if (edit) cards.setEdit(edit);
      if (!heard) return;
      for (const listener of [...listeners]) listener(message);
    },
    nextRequest: () => {
      requests += 1;
      return requests;
    },
    frames: () => cards.frames(),
    sendLive(body, to) {
      if (body.type === 'force' && to === undefined) force = body;
      for (const one of to ? [to] : cards.frames()) sendLive(one, body);
    },
    onLive(listener) {
      live.add(listener);
      return () => live.delete(listener);
    },
    receiveLive(from, message) {
      for (const listener of [...live]) listener(from, message);
    },
    cards,
    setPreviewWidth(width) {
      previewWidth = width;
    },
    sendPreview(changes, width) {
      const body: EditStudioBody = { type: 'preview', changes };
      for (const frame of targetsOf(body, cards, width)) sendEdit(frame, body);
    },
    flash(ids) {
      for (const frame of cards.frames()) sendFlash(frame, ids);
    },
  };
  return bridge;
}
