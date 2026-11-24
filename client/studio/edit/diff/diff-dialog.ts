// A diff to accept (spec 4d, goals 4 and 5; plan 17, task D owns it, task C calls it): the old
// source beside the current one, line by line, with what kitvas adds (imports) and what blocks it
// (missing names). Accept and Cancel; Escape cancels. Used by Bring back (timeline) and by Restore
// of a changed lock. A `dialog.k-pop.k-dialog` that rises in (plan 18). The rows are made in
// `line-diff.ts`; this file only draws them.

import { iconButton } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { diffRows } from './line-diff.ts';

export type DiffInput = {
  /** The dialog's heading, already worded. */
  title: string;
  /** The file both sources are in, shown under the heading. */
  file: string;
  old: string;
  current: string;
  /** Kit components the change imports. */
  imports: readonly string[];
  /** Names the old source needs that the current file lacks; any one blocks Accept. */
  missing: readonly string[];
  /** Accept was pressed (never called while `missing` is not empty). */
  accept(): void;
  /** Offered beside Cancel while `missing` is not empty. */
  askClaude?: (() => void) | undefined;
};

const DIALOG = 'dialog[data-edit="diff"]';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (content !== undefined) made.textContent = content;
  return made;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const made = element('button', className, label);
  made.type = 'button';
  made.addEventListener('click', onClick);
  return made;
}

/** One side's line; an empty cell where that side has no line in the row. */
function cell(line: string | null, side: 'old' | 'current', same: boolean): HTMLElement {
  const made = element('code', 'dialog-diff-line', line ?? '');
  made.dataset.side = side;
  if (!same) made.dataset.changed = line === null ? 'none' : side;
  return made;
}

function sources(input: DiffInput): HTMLElement {
  const grid = element('div', 'dialog-diff-rows');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', text('diff.sources'));
  grid.tabIndex = 0;
  grid.append(
    element('span', 'dialog-diff-side', text('diff.old')),
    element('span', 'dialog-diff-side', text('diff.current')),
  );
  for (const row of diffRows(input.old, input.current)) {
    grid.append(cell(row.old, 'old', row.same), cell(row.current, 'current', row.same));
  }
  return grid;
}

export function showDiff(ctx: EditorContext, input: DiffInput): void {
  // One dialog at a time: a second call replaces the first.
  for (const open of ctx.main.querySelectorAll<HTMLDialogElement>(DIALOG)) open.remove();
  const dialog = element('dialog', 'k-pop k-dialog dialog-diff');
  dialog.dataset.edit = 'diff';
  const blocked = input.missing.length > 0;
  const close = (): void => {
    dialog.close();
  };

  const head = element('div', 'k-head dialog-head');
  const heading = element('h2', 'dialog-title', input.title);
  heading.id = 'edit-diff-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  const shut = iconButton('close', text('diff.cancel'));
  shut.addEventListener('click', close);
  head.append(heading, shut);
  const notes = element('div', 'dialog-notes');
  notes.append(element('p', 'k-mono k-quiet dialog-file', input.file));
  if (input.imports.length > 0) {
    const names = input.imports.join(', ');
    notes.append(element('p', 'k-quiet', text('diff.imports', { names })));
  }
  if (blocked) {
    const names = input.missing.join(', ');
    const note = element('p', 'k-fix dialog-blocked', text('diff.missing', { names }));
    note.dataset.blocked = '';
    note.setAttribute('role', 'alert');
    notes.append(note);
  }

  const foot = element('div', 'dialog-actions');
  const cancel = button('k-btn', text('diff.cancel'), close);
  foot.append(cancel);
  const ask = input.askClaude;
  if (blocked && ask !== undefined) {
    foot.append(
      button('k-btn k-btn-line', text('diff.ask'), () => {
        close();
        ask();
      }),
    );
  }
  const accept = button('k-btn k-btn-primary', text('diff.accept'), () => {
    if (blocked) return;
    close();
    input.accept();
  });
  accept.dataset.primary = '';
  accept.disabled = blocked;
  foot.append(accept);

  dialog.append(head, notes, sources(input), foot);
  // Escape closes a modal dialog by itself; either way it leaves the page with nothing behind.
  dialog.addEventListener('close', () => dialog.remove());
  ctx.main.append(dialog);
  dialog.showModal();
  (blocked ? cancel : accept).focus();
}
