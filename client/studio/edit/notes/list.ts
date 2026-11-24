// The Notes pane (spec 4d, goal 3; plan 17, task C; plan 18, task B): a head with the count of
// open notes, one `.k-item` per note in list order, numbered as its pin, with where it is, who it
// is for, and Edit, Done and Delete; and at the pane's foot the field that adds one. A pinned
// note's number selects its element. Drawing only; `notes.ts` acts.

import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { MAX_NOTE_TEXT, type NoteRow } from './model.ts';

export type ListHandlers = {
  select(row: NoteRow): void;
  edit(row: NoteRow): void;
  done(row: NoteRow, done: boolean): void;
  remove(row: NoteRow): void;
};

/** Who a new note is for, and its words: what the foot's field sends. */
export type NoteDraft = { text: string; for: 'me' | 'claude' };

function action(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'k-btn notes-action', label);
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

function line(
  row: NoteRow,
  handlers: ListHandlers,
  selected: string | null,
  fresh: boolean,
): HTMLLIElement {
  const { note } = row;
  const item = el('li', fresh ? 'k-item notes-item k-slide' : 'k-item notes-item');
  item.dataset.note = note.id;
  if (note.done) item.dataset.done = '';
  if (row.pinned && note.current === selected) item.setAttribute('aria-current', 'true');
  const head = el('div', 'notes-head');
  const label = el('button', 'notes-label', row.label);
  label.type = 'button';
  label.disabled = !row.pinned;
  label.title = row.pinned ? text('notes.show') : text('notes.unpinned');
  label.addEventListener('click', () => handlers.select(row));
  const who = el('span', 'notes-who k-meta', text(`notes.for.${note.for}`));
  head.append(label, el('span', 'notes-place k-meta k-clip', placeWords(row)), who);
  const words = el('p', 'notes-text', note.text);
  const actions = el('div', 'notes-actions');
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

export type NotesPane = {
  /** `animate`: a note not drawn before slides in (off for the notes the page loaded with). */
  draw(
    rows: readonly NoteRow[],
    handlers: ListHandlers,
    selected: string | null,
    animate: boolean,
  ): void;
  /** The name the foot's field says it adds to; `null` for the draft as a whole. */
  target(name: string | null): void;
};

/**
 * Fills `host` (`section[data-edit="notes"]`) with the head, the list and the foot. `add` sends a
 * new note; it answers `false` when the studio did not take it, and the field keeps its words.
 */
export function createNotesPane(
  host: HTMLElement,
  add: (draft: NoteDraft) => Promise<boolean>,
): NotesPane {
  const head = el('div', 'k-pad notes-pane-head');
  const bar = el('div', 'k-head');
  const heading = el('h2', undefined, text('notes.title'));
  heading.id = 'edit-notes-heading';
  host.setAttribute('aria-labelledby', heading.id);
  const count = el('span', 'k-chip notes-count');
  count.hidden = true;
  bar.append(heading, count);
  head.append(bar);
  const scroll = el('div', 'k-scroll notes-scroll');
  const foot = el('form', 'k-actions notes-foot');
  const field = el('textarea', 'k-field notes-field');
  field.rows = 3;
  field.maxLength = MAX_NOTE_TEXT;
  field.setAttribute('aria-label', text('notes.text'));
  const hint = el('p', 'k-meta notes-hint', text('notes.hint'));
  const controls = el('div', 'notes-foot-row');
  const pick = el('div', 'k-seg');
  pick.setAttribute('role', 'group');
  pick.setAttribute('aria-label', text('notes.for'));
  let who: 'me' | 'claude' = 'me';
  for (const value of ['me', 'claude'] as const) {
    const one = el('button', undefined, text(`notes.for.${value}`));
    one.type = 'button';
    one.dataset.for = value;
    one.setAttribute('aria-pressed', String(value === who));
    one.addEventListener('click', () => {
      who = value;
      for (const other of pick.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other.dataset.for === who));
      }
    });
    pick.append(one);
  }
  const submit = el('button', 'k-btn k-btn-line', text('notes.add'));
  submit.type = 'submit';
  submit.disabled = true;
  controls.append(pick, submit);
  foot.append(field, hint, controls);
  host.append(head, scroll, foot);

  // The field grows with its words (`field-sizing` in the skin) up to a third of the pane.
  field.addEventListener('input', () => {
    submit.disabled = field.value.trim() === '';
  });
  // Ctrl+Enter (Cmd+Enter) adds the note, as it sends in the Claude tab; Enter is a new line.
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      foot.requestSubmit();
    }
  });
  foot.addEventListener('submit', (event) => {
    event.preventDefault();
    const words = field.value.trim();
    if (words === '') return;
    submit.disabled = true;
    void add({ text: words, for: who }).then((saved) => {
      if (saved) field.value = '';
      submit.disabled = field.value.trim() === '';
      field.focus();
    });
  });

  /** The notes already drawn: a note not in this set is new, and slides in once `animate` is on. */
  const seen = new Set<string>();
  return {
    target(name) {
      const words = name === null ? text('notes.addDraft') : text('notes.addTo', { name });
      field.placeholder = words;
    },
    draw(rows, handlers, selected, animate) {
      const open = rows.filter((row) => !row.note.done).length;
      count.textContent = text('notes.open', { count: open });
      count.hidden = open === 0;
      if (rows.length === 0) {
        scroll.replaceChildren(el('p', 'k-empty notes-none', text('notes.none')));
      } else {
        const list = el('ol', 'k-stack notes-list');
        for (const row of rows) {
          list.append(line(row, handlers, selected, animate && !seen.has(row.note.id)));
        }
        scroll.replaceChildren(list);
      }
      for (const row of rows) seen.add(row.note.id);
    },
  };
}
