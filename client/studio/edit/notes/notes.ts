// Notes pinned to elements (spec 4d, goal 3; plan 17, task C): "Note…" in the context menu opens
// the form, the Notes section sits at the bottom of the AI tab (after task B's content, never in
// its list), and every card gets the pins of the open notes while editing. A note for Claude also
// sends a `note` request (task A's route, through task B's client), which waits until a listening
// Claude Code session takes it; closing it marks the note done on the server. Fills `store.notes`.
// Nothing of a note reaches a build or a source file: the pins are an overlay of the frame.

import { frameMessage } from '../../frames.ts';
import { dropRequest, postRequest } from '../ai/api.ts';
import type { EditorContext } from '../context.ts';
import { elementName } from '../history/changes.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { changeNote, getNotes, postNote, removeNote } from './api.ts';
import { openNoteForm } from './form.ts';
import { createNotesList, type ListHandlers } from './list.ts';
import {
  NOTE_EVENT,
  type NoteRow,
  noteRequest,
  noteRequestKey,
  noteRows,
  pinsOf,
  waitingRequest,
} from './model.ts';

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
  const list = createNotesList();
  // At the bottom of the AI tab, after task B's own content (`mountAi` ran first).
  const section = ctx.panel.querySelector('section[data-edit="ai"]');
  if (section instanceof HTMLElement) section.append(list.element);

  let rows: NoteRow[] = [];
  let reload: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<void> {
    const notes = await getNotes(slug);
    if (notes !== null) store.set({ notes });
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

  function create(id: string | null): void {
    openNoteForm(main, {
      place: id === null ? null : elementName(id),
      text: '',
      for: 'me',
      save: async (values) => {
        const made = await postNote(slug, { element: id, text: values.text, for: values.for });
        if (made === null) return false;
        store.set({ notes: made.notes });
        if (values.for === 'claude') {
          await ask({ id: made.created, element: id, text: values.text });
        }
        return true;
      },
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
    list.draw(rows, handlers, state.selection[0] ?? null);
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
    if (state.notes !== previous.notes || state.selection !== previous.selection) render();
    if (state.notes !== previous.notes || state.on !== previous.on) sendPins();
    else if (state.builds !== previous.builds) sendPins();
    // Claude closed a note's request (the note is done now), or the files changed (ids moved).
    if (noteRequestKey(state.requests) !== noteRequestKey(previous.requests)) later();
    else if (state.etags !== previous.etags) later();
  });

  render();
  void load();
}
