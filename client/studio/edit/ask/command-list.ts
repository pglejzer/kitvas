// The list of commands above the ask bar (redesign spec goal 10; plan 19, task T3): a listbox the
// field drives while it keeps the focus. `listKey` is the key steps, pure; `createCommandList` draws
// the options (an option that is off shows its reason and does not run) and "No such command".

import { icon } from '../../ui/icon.ts';
import { el } from '../props/controls/controls.ts';
import { text } from '../texts.ts';
import type { Command } from './commands.ts';

export type ListKey = 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape';

/** What a key does in the open list. */
export type ListStep =
  | { kind: 'move'; active: number }
  | { kind: 'run'; command: Command }
  /** Enter on an option that is off, or on an empty list: the reason stays on the screen. */
  | { kind: 'stay' }
  | { kind: 'close' };

/** `active` is the highlighted option; arrows wrap around. */
export function listKey(commands: readonly Command[], active: number, key: ListKey): ListStep {
  if (key === 'Escape') return { kind: 'close' };
  if (commands.length === 0) return { kind: 'stay' };
  if (key === 'ArrowDown') return { kind: 'move', active: (active + 1) % commands.length };
  if (key === 'ArrowUp') {
    return { kind: 'move', active: (active - 1 + commands.length) % commands.length };
  }
  const command = commands[active];
  return command?.enabled === true ? { kind: 'run', command } : { kind: 'stay' };
}

export const isListKey = (key: string): key is ListKey =>
  key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === 'Escape';

export type CommandList = {
  element: HTMLElement;
  /** The id of the listbox, for `aria-controls`. */
  listboxId: string;
  /** The id of the active option, for `aria-activedescendant`; `null` when none. */
  render(commands: readonly Command[], active: number): string | null;
  show(): void;
  hide(): void;
  isOpen(): boolean;
};

const optionId = (id: string): string => `ask-option-${id}`;

/** `pick`: a click on an option. The pointer never takes the focus from the field. */
export function createCommandList(pick: (command: Command) => void): CommandList {
  const element = el('div', 'k-pop k-menu ask-list');
  element.hidden = true;
  const listboxId = 'ask-listbox';
  const box = el('div', 'ask-options');
  box.id = listboxId;
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', text('ask.commands'));
  const empty = el('p', 'k-meta ask-empty', text('ask.noCommand'));
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  element.append(box, empty);

  function optionOf(command: Command, active: boolean): HTMLElement {
    const option = el('div', 'k-menu-item ask-option');
    option.id = optionId(command.id);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(active));
    option.setAttribute('aria-disabled', String(!command.enabled));
    if (active) option.dataset.active = '';
    const mark = el('span', 'ask-option-icon');
    if (command.icon !== null) mark.append(icon(command.icon));
    const words = el('span', 'ask-option-text');
    words.append(el('span', undefined, command.label));
    if (command.reason !== null)
      words.append(el('span', 'k-meta ask-option-reason', command.reason));
    option.append(mark, words);
    if (command.keys !== null) option.append(el('kbd', 'k-kbd', command.keys));
    // The field keeps the focus: a pointer press on an option must not blur it.
    option.addEventListener('pointerdown', (event) => event.preventDefault());
    option.addEventListener('click', () => pick(command));
    return option;
  }

  return {
    element,
    listboxId,
    render(commands, active) {
      box.replaceChildren(...commands.map((command, at) => optionOf(command, at === active)));
      empty.hidden = commands.length > 0;
      box.hidden = commands.length === 0;
      const current = commands[active];
      if (current)
        box.querySelector(`[id="${optionId(current.id)}"]`)?.scrollIntoView?.({ block: 'nearest' });
      return current ? optionId(current.id) : null;
    },
    show() {
      element.hidden = false;
    },
    hide() {
      element.hidden = true;
      box.replaceChildren();
    },
    isOpen: () => !element.hidden,
  };
}
