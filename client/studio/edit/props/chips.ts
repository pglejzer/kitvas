// Two small controls of Properties (plan 18f, task 2; spec S4.6 items 3 and 6): option chips for
// an enum prop (`.k-opts`), and a locked chip for a value that is not edited here, a prop set by
// code or a row the kit or the context holds, with the reason as its tooltip and for assistive
// technology instead of a sentence under it. Built with `textContent` only.

import { icon } from '../../ui/icon.ts';
import { el } from './controls.ts';

/**
 * One chip per value, the current one pressed. `current` is `null` when the tag sets nothing (or
 * the selected elements differ); `hint` is the value then in force (the catalog's default), which
 * is outlined, never filled, as a keyword the frame computes is.
 */
export function optionChips(options: {
  label: string;
  options: readonly string[];
  current: string | null;
  hint: string | null;
  onPick(value: string): void;
}): HTMLElement {
  const group = el('div', 'k-opts props-chips');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', options.label);
  for (const value of options.options) {
    const button = el('button', undefined, value);
    button.type = 'button';
    button.dataset.control = `opt-${value}`;
    button.setAttribute('aria-pressed', String(value === options.current));
    if (options.current === null && value === options.hint) button.dataset.computed = '';
    button.addEventListener('click', () => {
      if (value !== options.current) options.onPick(value);
    });
    group.append(button);
  }
  return group;
}

/**
 * A value shown as it is and not edited here: a lock, the value in the code font, and `reason`
 * as the tooltip (with the whole value, which may be clipped) and as text for a screen reader.
 */
export function lockedChip(value: string, reason: string): HTMLElement {
  const chip = el('span', 'k-chip props-locked');
  chip.title = `${value}\n${reason}`;
  chip.append(icon('lock'), el('code', 'k-clip', value), el('span', 'k-sr', reason));
  return chip;
}
