// The Notes section at the bottom of the AI tab (spec 4d, goal 3; plan 17, task C): one line per
// note in list order, numbered as its pin, with where it is, who it is for, and Edit, Done and
// Delete. A pinned note's number selects its element. Drawing only; `notes.ts` acts.

import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import type { NoteRow } from './model.ts';

export type ListHandlers = {
  select(row: NoteRow): void;
  edit(row: NoteRow): void;
  done(row: NoteRow, done: boolean): void;
  remove(row: NoteRow): void;
};

function action(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'edit-notes-action', label);
  button.type = 'button';
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function placeWords(row: NoteRow): string {
  if (row.place === null) return text('notes.onDraft');
  return row.place.gone
    ? text('notes.was', { name: row.place.name })
    : text('notes.on', { name: row.place.name });
}

function line(row: NoteRow, handlers: ListHandlers, selected: string | null): HTMLLIElement {
  const { note } = row;
  const item = el('li', 'edit-notes-item');
  if (note.done) item.dataset.done = '';
  if (row.pinned && note.current === selected) item.dataset.selected = '';
  const head = el('div', 'edit-notes-head');
  const label = el('button', 'edit-notes-label', row.label);
  label.type = 'button';
  label.disabled = !row.pinned;
  label.title = row.pinned ? text('notes.show') : text('notes.unpinned');
  label.addEventListener('click', () => handlers.select(row));
  const who = el('span', 'edit-notes-who', text(`notes.for.${note.for}`));
  head.append(label, el('span', 'edit-notes-place', placeWords(row)), who);
  const words = el('p', 'edit-notes-text', note.text);
  const actions = el('div', 'edit-notes-actions');
  actions.append(
    action(text('notes.editButton'), text('notes.editTitle'), () => handlers.edit(row)),
    note.done
      ? action(text('notes.reopen'), text('notes.reopenTitle'), () => handlers.done(row, false))
      : action(text('notes.done'), text('notes.doneTitle'), () => handlers.done(row, true)),
    action(text('notes.delete'), text('notes.deleteTitle'), () => handlers.remove(row)),
  );
  item.append(head, words, actions);
  return item;
}

/** The section's element; `draw` fills it again. */
export function createNotesList(): {
  element: HTMLElement;
  draw(rows: readonly NoteRow[], handlers: ListHandlers, selected: string | null): void;
} {
  const element = el('section', 'edit-notes');
  element.dataset.edit = 'notes';
  const heading = el('h3', 'edit-notes-heading', text('notes.title'));
  heading.id = 'edit-notes-heading';
  element.setAttribute('aria-labelledby', heading.id);
  const body = el('div', 'edit-notes-body');
  element.append(heading, body);
  return {
    element,
    draw(rows, handlers, selected) {
      heading.textContent =
        rows.length === 0 ? text('notes.title') : text('notes.count', { count: rows.length });
      if (rows.length === 0) {
        body.replaceChildren(el('p', 'edit-notes-none', text('notes.none')));
        return;
      }
      const list = el('ol', 'edit-notes-list');
      for (const row of rows) list.append(line(row, handlers, selected));
      body.replaceChildren(list);
    },
  };
}
