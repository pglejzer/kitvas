// The note form (spec 4d, goal 3; plan 17, task C): a small dialog with the note's text and who
// it is for, opened by "Note…" in the context menu and by Edit in the Notes list. Escape and
// Cancel close it; Save sends it and closes it when the studio took it.

import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { MAX_NOTE_TEXT, noteText } from './model.ts';

const DIALOG = 'dialog[data-edit="note"]';

export type NoteForm = {
  /** The element's name, shown under the heading; `null` for a note on the draft. */
  place: string | null;
  /** The text to start from: an edited note's. */
  text: string;
  /** Who the note is for; `null` when that cannot change (an edited note). */
  for: 'me' | 'claude' | null;
  /** Saves; `false` keeps the form open with a line saying it did not work. */
  save(values: { text: string; for: 'me' | 'claude' }): Promise<boolean>;
};

function choice(name: string, value: 'me' | 'claude', checked: boolean): HTMLLabelElement {
  const label = el('label', 'notes-form-for');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  label.append(input, el('span', undefined, text(`notes.for.${value}`)));
  return label;
}

export function openNoteForm(main: HTMLElement, form: NoteForm): void {
  // One form at a time: a second one replaces the first.
  for (const open of main.querySelectorAll<HTMLDialogElement>(DIALOG)) open.remove();
  const dialog = el('dialog', 'k-pop k-dialog notes-form');
  dialog.dataset.edit = 'note';
  const shape = el('form', 'notes-form-body');
  shape.method = 'dialog';
  const title = el('h2', undefined, text(form.for === null ? 'notes.edit' : 'notes.new'));
  title.id = 'edit-note-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const place = el(
    'p',
    'k-quiet',
    form.place === null ? text('notes.onDraft') : text('notes.on', { name: form.place }),
  );
  const field = el('textarea', 'k-field notes-form-text');
  field.maxLength = MAX_NOTE_TEXT;
  field.rows = 4;
  field.required = true;
  field.value = form.text;
  field.setAttribute('aria-label', text('notes.text'));
  shape.append(title, place, field);
  const name = 'edit-note-for';
  if (form.for !== null) {
    const group = el('fieldset', 'notes-form-fors');
    group.append(
      el('legend', undefined, text('notes.for')),
      choice(name, 'me', form.for === 'me'),
      choice(name, 'claude', form.for === 'claude'),
    );
    shape.append(group);
  }
  const said = el('p', 'notes-form-said k-fix');
  said.setAttribute('role', 'status');
  const foot = el('div', 'notes-form-foot');
  const cancel = el('button', 'k-btn', text('notes.cancel'));
  cancel.type = 'button';
  const save = el('button', 'k-btn k-btn-primary', text('notes.save'));
  save.type = 'submit';
  save.dataset.primary = '';
  foot.append(cancel, save);
  shape.append(said, foot);
  dialog.append(shape);

  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  const sync = (): void => {
    save.disabled = noteText(field.value) === null;
  };
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', close);
  field.addEventListener('input', sync);
  shape.addEventListener('submit', (event) => {
    event.preventDefault();
    const words = noteText(field.value);
    if (words === null) return;
    const picked = shape.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    const who = picked?.value === 'claude' ? 'claude' : (form.for ?? 'me');
    save.disabled = true;
    said.textContent = '';
    void form.save({ text: words, for: who }).then((saved) => {
      if (saved) {
        close();
        return;
      }
      said.textContent = text('notes.failed');
      sync();
    });
  });
  main.append(dialog);
  sync();
  dialog.showModal();
  field.focus();
}
