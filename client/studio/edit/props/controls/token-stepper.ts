// The stepper over a kit's scale (plan 18f, task 2; spec S4.6 item 5): the shared `.k-stepper`, a
// radio group with a stop per token and its label under it (`sm · 6`). The arrow keys, Home and
// End move to a stop and take it, as a radio group does; a click takes one; pointing at a stop
// previews it on the canvas. The stops come from `stepperOf` (`stepper.ts`).

import type { Stop } from '../values/stepper.ts';
import { el } from './controls.ts';

const STEP_KEYS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function tokenStepper(options: {
  label: string;
  stops: readonly Stop[];
  /** The stop the source names; `-1` for none. */
  at: number;
  /** The stop the frame computes while the source sets nothing; `-1` for none. */
  hint: number;
  /** The words of a live check a stop would fail; `null` for none. */
  warn?: (stop: Stop) => string | null;
  onPick(stop: Stop): void;
  onPreview?(stop: Stop | null): void;
}): HTMLElement {
  const group = el('div', 'k-stepper props-stepper');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', options.label);
  let checked = options.at;
  const buttons: HTMLButtonElement[] = [];

  /** Puts the one tab stop of the group on `index`. */
  const roam = (index: number): void => {
    for (const [at, button] of buttons.entries()) button.tabIndex = at === index ? 0 : -1;
  };

  const take = (index: number): void => {
    const stop = options.stops[index];
    if (stop === undefined || index === checked) return;
    checked = index;
    for (const [at, button] of buttons.entries()) {
      button.setAttribute('aria-checked', String(at === index));
    }
    options.onPick(stop);
  };

  for (const [index, stop] of options.stops.entries()) {
    const button = el('button', 'k-stepper-stop', stop.label);
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(index === options.at));
    button.dataset.control = `stop-${stop.var}`;
    const warning = options.warn?.(stop) ?? null;
    button.title = warning === null ? `${stop.label} (${stop.css})` : `${stop.label}: ${warning}`;
    if (warning !== null) {
      button.dataset.warn = '';
      button.setAttribute('aria-description', warning);
    }
    if (index === options.hint) button.dataset.computed = '';
    button.addEventListener('click', () => {
      roam(index);
      take(index);
    });
    button.addEventListener('pointerenter', () => options.onPreview?.(stop));
    button.addEventListener('pointerleave', () => options.onPreview?.(null));
    buttons.push(button);
  }
  roam(options.at >= 0 ? options.at : Math.max(0, options.hint));

  group.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const last = buttons.length - 1;
    const from = buttons.findIndex((button) => button === document.activeElement);
    let next: number | null = null;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else {
      const step = STEP_KEYS[event.key];
      const start = from < 0 ? checked : from;
      if (step !== undefined) next = Math.min(last, Math.max(0, start + step));
    }
    if (next === null || next < 0) return;
    event.preventDefault();
    roam(next);
    buttons[next]?.focus();
    take(next);
  });

  group.append(...buttons);
  return group;
}
