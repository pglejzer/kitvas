// The locks box in the right panel (spec 4d, goal 4; plan 17, task C), under the conflict box:
// the selected locked element another writer changed (Restore, Unlock), the locks whose element
// was not found after such a change (Lock again on the selection, Forget), and an edit a lock
// refused (Unlock). Drawing only; `view.ts` acts.

import type { EditorContext } from '../context.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import type { LocksModel } from './model.ts';

export type LocksHandlers = {
  restore(id: string): void;
  unlock(id: string): void;
  lockAgain(lostId: string): void;
  forget(lostId: string): void;
};

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const made = el('button', 'edit-locks-button', label);
  made.type = 'button';
  if (primary) made.dataset.primary = '';
  made.addEventListener('click', onClick);
  return made;
}

export function mountLocksBox(
  ctx: EditorContext,
  handlers: LocksHandlers,
): { render(model: LocksModel): void; say(words: string): void } {
  const box = el('div', 'edit-locks');
  box.dataset.edit = 'locks';
  box.hidden = true;
  const body = el('div', 'edit-locks-body');
  const said = el('p', 'edit-locks-said');
  said.setAttribute('role', 'status');
  box.append(body, said);
  // In the right panel under the conflict box, outside the panes their renders replace.
  const conflict = ctx.panel.querySelector('[data-edit="conflict"]');
  if (conflict) conflict.after(box);
  else ctx.panel.append(box);

  function changedPart(model: LocksModel): HTMLElement[] {
    const changed = model.changed;
    if (changed === null) return [];
    const row = el('div', 'edit-locks-row');
    const actions = el('div', 'edit-locks-actions');
    actions.append(
      button(text('locks.restore'), () => handlers.restore(changed.id), true),
      button(text('locks.unlock'), () => handlers.unlock(changed.id)),
    );
    row.append(el('p', 'edit-locks-line', text('locks.changedHere')), actions);
    return [row];
  }

  function lostPart(model: LocksModel): HTMLElement[] {
    if (model.lost.length === 0) return [];
    const row = el('div', 'edit-locks-row');
    row.append(el('p', 'edit-locks-line', text('locks.lost', { count: model.lost.length })));
    const list = el('ul', 'edit-locks-lost');
    for (const lost of model.lost) {
      const item = el('li', 'edit-locks-item');
      const again = button(text('locks.lockAgain'), () => handlers.lockAgain(lost.id));
      again.disabled = !model.canLockAgain;
      again.title = text(model.canLockAgain ? 'locks.lockAgainTitle' : 'locks.lockAgainNone');
      item.append(
        el('span', 'edit-locks-name', lost.name),
        again,
        button(text('locks.forget'), () => handlers.forget(lost.id)),
      );
      list.append(item);
    }
    row.append(list);
    return [row];
  }

  function refusedPart(model: LocksModel): HTMLElement[] {
    const refused = model.refused;
    if (refused === null) return [];
    const row = el('div', 'edit-locks-row');
    const words = refused.unlock === null ? 'locks.refusedInside' : 'locks.refused';
    row.append(el('p', 'edit-locks-line', text(words)));
    const unlock = refused.unlock;
    if (unlock !== null) row.append(button(text('locks.unlock'), () => handlers.unlock(unlock)));
    return [row];
  }

  return {
    render(model) {
      const parts = [...changedPart(model), ...lostPart(model), ...refusedPart(model)];
      body.replaceChildren(...parts);
      box.hidden = parts.length === 0 && said.textContent === '';
    },
    say(words) {
      said.textContent = words;
      if (words !== '') box.hidden = false;
    },
  };
}
