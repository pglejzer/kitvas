// The conflict choice: keep mine or keep theirs (plan 13, task H). The panel's own div above the
// panes is shown while `store.conflict` is set, and rises in (plan 18). The "Ask Claude" note of
// a refused edit (`history/ask.ts`) lives beside it.

import type { EditorContext } from '../context.ts';
import type { Conflict } from '../store.ts';
import { text } from '../texts.ts';

function button(
  label: string,
  action: string,
  primary: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = primary ? 'k-btn k-btn-line' : 'k-btn';
  element.textContent = label;
  element.dataset.conflictAction = action;
  element.addEventListener('click', onClick);
  return element;
}

export function mountConflict(ctx: EditorContext): void {
  const host = ctx.panel.querySelector<HTMLElement>('[data-edit="conflict"]');
  if (!host) return;
  host.classList.add('conflict-note', 'k-rise');
  const body = document.createElement('div');
  body.className = 'conflict-body';
  body.dataset.conflictBody = '';
  host.append(body);

  let shown: Conflict | null = null;
  const render = (): void => {
    const { conflict, busy } = ctx.store.get();
    host.hidden = conflict === null;
    if (conflict === shown) {
      for (const item of body.querySelectorAll('button')) item.disabled = busy;
      return;
    }
    shown = conflict;
    body.replaceChildren();
    if (!conflict) return;
    const { reason, file } = conflict.outcome;
    const title = document.createElement('strong');
    title.className = 'conflict-title';
    title.textContent = text('conflict.title');
    const note = document.createElement('p');
    note.className = 'conflict-text';
    note.textContent = text(reason === 'gone' ? 'conflict.gone' : 'conflict.changed', { file });
    const choices = document.createElement('div');
    choices.className = 'conflict-actions';
    // A place that is gone cannot be written over: only "keep theirs" is offered.
    if (reason === 'changed') {
      choices.append(
        button(text('conflict.keepMine'), 'mine', true, () => void ctx.history.keepMine()),
      );
    }
    choices.append(
      button(text('conflict.keepTheirs'), 'theirs', reason !== 'changed', () =>
        ctx.history.keepTheirs(),
      ),
    );
    body.append(title, note, choices);
    for (const item of choices.querySelectorAll('button')) item.disabled = busy;
  };

  ctx.store.subscribe(render);
  render();
}
