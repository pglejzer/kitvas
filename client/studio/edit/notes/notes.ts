// Notes pinned to elements (spec 4d, goal 3; plan 17, task C; plan 18, task B): "Note…" in the
// context menu opens the form, the Notes pane (`section[data-edit="notes"]`, its own pane on the
// rail) lists them and adds one at its foot, the bar's Notes button (`[data-bar-notes]`) shows how
// many are open, and every card gets the pins of the open notes while editing. A note for Claude
// also sends a `note` request (task A's route, through task B's client), which waits until a
// listening Claude Code session takes it; closing it marks the note done on the server. Fills
// `store.notes`. Nothing of a note reaches a build or a source file: the pins are an overlay of
// the frame.

import { frameMessage } from '../../frames.ts';
import { dropRequest, postRequest } from '../ai/api.ts';
import type { EditorContext } from '../context.ts';
import { elementName } from '../history/changes.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { changeNote, getNotes, postNote, removeNote } from './api.ts';
import { openNoteForm } from './form.ts';
import { createNotesPane, type ListHandlers, type NoteDraft } from './list.ts';
import {
  NOTE_EVENT,
  type NoteRow,
  noteRequest,
  noteRequestKey,
  noteRows,
  noteStatus,
  openCount,
  pinsOf,
  waitingRequest,
} from './model.ts';
import { type Box, menuAnchor } from './place.ts';

/** How long after a change of the files the notes are read again: their ids may have moved. */
const RELOAD_MS = 300;

function isNoteAsked(event: Event): event is CustomEvent<{ id: string | null }> {
  if (!(event instanceof CustomEvent)) return false;
  const detail: unknown = event.detail;
  if (typeof detail !== 'object' || detail === null || !('id' in detail)) return false;
  return detail.id === null || typeof detail.id === 'string';
}

export function mountNotes(ctx: EditorContext): void {
  const { store, bridge, slug, main } = ctx;
  // The Notes pane (C8); without it the notes still work through the form and the pins.
  const host = ctx.panel.querySelector('section[data-edit="notes"]');
  const pane = createNotesPane(
    host instanceof HTMLElement ? host : document.createElement('section'),
    (draft) => save(store.get().selection[0] ?? null, draft),
  );

  let rows: NoteRow[] = [];
  let reload: ReturnType<typeof setTimeout> | null = null;
  /** The notes the page started with are drawn at once; a note that comes later slides in. */
  let loaded = false;

  async function load(): Promise<void> {
    const notes = await getNotes(slug);
    if (notes !== null) store.set({ notes });
    loaded = true;
  }

  /** The bar's Notes button says how many notes are open, and is hidden at none (C8). */
  function syncBar(): void {
    const button = document.querySelector<HTMLElement>('[data-bar-notes]');
    if (!button) return;
    const count = openCount(store.get().notes);
    const shown = button.querySelector<HTMLElement>('[data-count]');
    if (shown) shown.textContent = String(count);
    button.hidden = count === 0;
  }

  function later(): void {
    if (reload !== null) clearTimeout(reload);
    reload = setTimeout(() => {
      reload = null;
      void load();
    }, RELOAD_MS);
  }

  /** The pins of every card, or of one card that just loaded a page. */
  function sendPins(to?: Parameters<typeof bridge.sendLive>[1]): void {
    const pins = store.get().on ? pinsOf(rows) : [];
    bridge.sendLive({ type: 'pins', pins }, to);
  }

  /** A note for Claude asks Claude too; the request's text is the note's. */
  async function ask(note: { id: string; element: string | null; text: string }): Promise<void> {
    const sent = await postRequest(slug, noteRequest(note, store.get().context));
    toast(main, text(sent ? 'notes.sent' : 'notes.notSent'));
  }

  /** The waiting request of a note is taken back: the note is gone, done or worded again. */
  async function drop(noteId: string): Promise<void> {
    const waiting = waitingRequest(store.get().requests, noteId);
    if (waiting !== undefined) await dropRequest(slug, waiting.id);
  }

  /** Saves a new note on `id` (`null`: the draft); a note for Claude asks Claude too. */
  async function save(id: string | null, values: NoteDraft): Promise<boolean> {
    const made = await postNote(slug, { element: id, text: values.text, for: values.for });
    if (made === null) return false;
    store.set({ notes: made.notes });
    if (values.for === 'claude') {
      await ask({ id: made.created, element: id, text: values.text });
    }
    return true;
  }

  /** The panel's box, for a form opened from the Notes list. */
  function panelBox(): Box | null {
    const box = host instanceof HTMLElement ? host.getBoundingClientRect() : null;
    return box === null ? null : { x: box.left, y: box.top, width: box.width, height: box.height };
  }

  /** The point of the last context menu click, kept until a form takes it. */
  let clicked: { id: string | null; x: number; y: number; box?: Box } | null = null;

  function create(id: string | null): void {
    const click = clicked !== null && clicked.id === id ? clicked : null;
    clicked = null;
    openNoteForm(main, {
      place: id === null ? null : elementName(id),
      text: '',
      for: 'me',
      at: click === null ? null : menuAnchor(click),
      panel: panelBox(),
      save: (values) => save(id, values),
    });
  }

  const handlers: ListHandlers = {
    select(row) {
      const id = row.note.current;
      if (!row.pinned || id === null || !store.get().on) return;
      store.set({ selection: [id] });
    },
    edit(row) {
      const { note } = row;
      openNoteForm(main, {
        place: row.place?.name ?? null,
        text: note.text,
        for: null,
        at: null,
        panel: panelBox(),
        save: async (values) => {
          const notes = await changeNote(slug, note.id, { text: values.text });
          if (notes === null) return false;
          store.set({ notes });
          // Claude gets the new words: the request that still waits is sent again.
          if (note.for === 'claude' && waitingRequest(store.get().requests, note.id)) {
            await drop(note.id);
            await ask({ id: note.id, element: note.current, text: values.text });
          }
          return true;
        },
      });
    },
    done(row, done) {
      void changeNote(slug, row.note.id, { done }).then(async (notes) => {
        if (notes === null) {
          toast(main, text('notes.failed'));
          return;
        }
        store.set({ notes });
        if (done) await drop(row.note.id);
      });
    },
    remove(row) {
      void removeNote(slug, row.note.id).then(async (notes) => {
        if (notes === null) {
          toast(main, text('notes.failed'));
          return;
        }
        store.set({ notes });
        await drop(row.note.id);
      });
    },
  };

  function render(): void {
    const state = store.get();
    rows = noteRows(state.notes);
    const selected = state.selection[0] ?? null;
    pane.target(selected === null ? null : elementName(selected));
    pane.draw(rows, handlers, selected, loaded, (row) => noteStatus(row.note, state.requests));
    syncBar();
  }

  document.addEventListener(NOTE_EVENT, (event) => {
    if (isNoteAsked(event)) create(event.detail.id);
  });

  // A card that loads a page has lost its pins: they are sent to it again.
  if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
      const heard = frameMessage(bridge.frames(), event);
      if (heard?.message.type === 'ready') sendPins(heard.frame);
    });
  }

  store.subscribe((state, previous) => {
    if (state.menu !== null && state.menu !== previous.menu) clicked = state.menu;
    const asked = noteRequestKey(state.requests) !== noteRequestKey(previous.requests);
    if (state.notes !== previous.notes || state.selection !== previous.selection || asked) {
      render();
    }
    if (state.notes !== previous.notes || state.on !== previous.on) sendPins();
    else if (state.builds !== previous.builds) sendPins();
    // Claude closed a note's request (the note is done now), or the files changed (ids moved).
    if (noteRequestKey(state.requests) !== noteRequestKey(previous.requests)) later();
    else if (state.etags !== previous.etags) later();
  });

  render();
  void load();
}
