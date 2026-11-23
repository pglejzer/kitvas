// The conflict choice: keep mine or keep theirs (plan 13, task H). The panel's own div is shown
// while `store.conflict` is set. The "Ask Claude" button of task K lives beside this body.

import type { EditorContext } from './context.ts';
import type { Conflict } from './store.ts';
import { text } from './texts.ts';

function button(label: string, action: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.dataset.conflictAction = action;
  element.addEventListener('click', onClick);
  return element;
}

export function mountConflict(ctx: EditorContext): void {
  const host = ctx.panel.querySelector<HTMLElement>('[data-edit="conflict"]');
  if (!host) return;
  const body = document.createElement('div');
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
    title.textContent = text('conflict.title');
    const note = document.createElement('p');
    note.textContent = text(reason === 'gone' ? 'conflict.gone' : 'conflict.changed', { file });
    const choices = document.createElement('div');
    choices.className = 'edit-conflict-actions';
    // A place that is gone cannot be written over: only "keep theirs" is offered.
    if (reason === 'changed') {
      choices.append(button(text('conflict.keepMine'), 'mine', () => void ctx.history.keepMine()));
    }
    choices.append(button(text('conflict.keepTheirs'), 'theirs', () => ctx.history.keepTheirs()));
    body.append(title, note, choices);
    for (const item of choices.querySelectorAll('button')) item.disabled = busy;
  };

  ctx.store.subscribe(render);
  render();
}
