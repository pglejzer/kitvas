// The number field under a "Custom" row (plan 19, task T5; spec goal 14, mock `custom-picker-mock`):
// an amount with the property's units beside it (none for a weight or a plain line height), arrow
// keys to step it (Shift ten), the canvas showing the value while it is typed, one write on Enter
// or blur, Escape to give the old value back, and the line "Off kit · nearest <token>" with the
// button that writes the token. A value that is no number is marked with the reason and never
// written. It replaces the length and raw editors `controls.ts` had. The editor closes on Escape
// (old value back), when a token is picked, when "Custom..." is pressed again, when the selection
// changes, and on a press outside it or a blur of the window (`outside.ts`), which `release`s:
// the value on show is written once.

import type { TokenOption } from '../../../../../src/edit/index.ts';
import { type SelectItem, studioSelect } from '../../../ui/select/select.ts';
import { text } from '../../texts.ts';
import { tokenNameOf } from '../stepper.ts';
import { el, field } from './dom.ts';
import {
  AUTO,
  NONE,
  type NumberRule,
  parseAmount,
  type Reason,
  readAmount,
  stepAmount,
} from './number-rules.ts';

export type NumberFieldOptions = NumberRule & {
  label: string;
  /** The value the source holds (`17px`, `650`), or `null`. */
  value: string | null;
  /** Where an empty field starts when an arrow key is pressed. */
  start?: number;
  /** The token of the property's scale nearest to a value, for the "Off kit" line. */
  nearest?: (css: string) => TokenOption | null;
  /** The value now, or `null` to take the preview back. */
  onPreview(css: string | null): void;
  onPick(css: string): void;
  onUse(token: TokenOption): void;
  /** Escape: the old value is back; the row closes the editor. */
  onCancel?(): void;
};

export type Editor = {
  root: HTMLElement;
  focus(): void;
  hidden(on: boolean): void;
  /**
   * A close by a press outside (`outside.ts`): what is on show is written once, as a blur writes
   * it, and only if it differs from the source; a value that cannot be written is taken back.
   */
  release(): void;
  /** `true` while the editor waits on something outside the page (the eyedropper). */
  busy(): boolean;
};

/** The reason an amount was refused, in words. */
export function reasonText(reason: Reason): string {
  if (reason.key === 'number') return text('props.number.invalid');
  return text(reason.key === 'min' ? 'props.number.min' : 'props.number.max', {
    limit: reason.limit,
  });
}

/** "Off kit · nearest <token>" and its "Use <token>" button; `show(null)` hides the line. */
export function offKitLine(onUse: (token: TokenOption) => void): {
  root: HTMLElement;
  show(css: string | null, nearest: TokenOption | null): void;
} {
  const root = el('div', 'props-nearest');
  root.hidden = true;
  return {
    root,
    show(css, token) {
      root.hidden = css === null;
      root.replaceChildren();
      if (css === null) return;
      if (token === null) {
        root.append(el('span', undefined, text('props.offkit')));
        return;
      }
      const name = tokenNameOf(token);
      root.append(el('span', undefined, text('props.custom.nearest', { token: name })));
      const use = el('button', 'props-use', text('props.offkit.use', { token: name }));
      use.type = 'button';
      use.title = text('props.offkit.useTitle', { token: name, value: token.css });
      use.addEventListener('click', () => onUse(token));
      root.append(use);
    },
  };
}

export function numberField(options: NumberFieldOptions): Editor {
  const rule: NumberRule = {
    min: options.min,
    max: options.max,
    step: options.step,
    units: options.units,
  };
  const root = el('span', 'props-num-editor');
  root.dataset.customEditor = '';
  const shown = readAmount(options.value, rule);
  const label = text('props.custom.label', { property: options.label });
  const amount = field('k-field props-num-value', 'custom', label, shown.amount);
  amount.dataset.editorFocus = '';
  amount.inputMode = 'decimal';
  amount.autocomplete = 'off';
  if (shown.unread !== null) amount.placeholder = shown.unread;
  let unitNow = shown.unit;
  const box = el('span', 'props-num');
  const problem = el('span', 'props-error');
  problem.setAttribute('role', 'status');
  problem.hidden = true;
  const line = offKitLine((token) => options.onUse(token));
  /** What was written last (or is in the source): the same value is not written twice. */
  let written: string | null = options.value;
  let previewing = false;

  const read = () => parseAmount(amount.value, unitNow, rule);
  const mark = (reason: Reason | null): void => {
    amount.setAttribute('aria-invalid', reason === null ? 'false' : 'true');
    box.dataset.invalid = reason === null ? 'false' : 'true';
    problem.hidden = reason === null;
    if (reason !== null) problem.textContent = reasonText(reason);
  };
  const preview = (): void => {
    if (amount.value.trim() === '' && unitNow !== AUTO) {
      mark(null);
      line.show(null, null);
      if (previewing) options.onPreview(null);
      previewing = false;
      return;
    }
    const parsed = read();
    if (!parsed.ok) {
      mark(parsed.reason);
      line.show(null, null);
      return;
    }
    mark(null);
    previewing = true;
    options.onPreview(parsed.css);
    line.show(parsed.css, options.nearest?.(parsed.css) ?? null);
  };
  const commit = (): void => {
    if (amount.value.trim() === '' && unitNow !== AUTO) return;
    const parsed = read();
    if (!parsed.ok) {
      mark(parsed.reason);
      return;
    }
    mark(null);
    if (parsed.css === written) {
      if (previewing) options.onPreview(null);
      previewing = false;
      return;
    }
    written = parsed.css;
    previewing = false;
    options.onPick(parsed.css);
  };

  amount.addEventListener('input', preview);
  amount.addEventListener('change', commit);
  amount.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      // The old value comes back and nothing is written.
      event.preventDefault();
      event.stopPropagation();
      amount.value = shown.amount;
      unitNow = shown.unit;
      mark(null);
      line.show(null, null);
      if (previewing) options.onPreview(null);
      previewing = false;
      options.onCancel?.();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      amount.value = stepAmount(amount.value, direction, event.shiftKey, rule, options.start ?? 0);
      preview();
    }
  });
  // A held arrow key previews every step; the release writes the last one, as one undo step.
  amount.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') commit();
  });

  box.append(amount);
  let unitTrigger: HTMLElement = amount;
  if (options.units.length > 0) {
    const items: SelectItem[] = options.units.map((name) => ({
      value: name,
      name: name === NONE ? text('props.unit.none') : name,
      group: null,
      detail: null,
      swatch: null,
      warn: null,
    }));
    const unit = studioSelect({
      label: text('props.unit', { property: options.label }),
      items,
      value: unitNow,
      placeholder: unitNow,
      control: 'unit',
      search: { label: text('props.select.search'), none: text('props.select.none') },
      onPick: (name) => {
        unitNow = name;
        amount.disabled = name === AUTO;
        if (name === AUTO) amount.value = '';
        commit();
      },
    });
    unit.root.classList.add('props-num-unit');
    amount.disabled = unitNow === AUTO;
    unitTrigger = amount.disabled ? unit.trigger : amount;
    box.append(unit.root);
  }
  root.append(box, problem, line.root);
  return {
    root,
    focus: () => (amount.disabled ? unitTrigger : amount).focus(),
    hidden: (on) => {
      root.hidden = on;
    },
    release: () => {
      commit();
      // A value that was refused, or an empty field, leaves its preview on the canvas: take it back.
      if (previewing) options.onPreview(null);
      previewing = false;
    },
    busy: () => false,
  };
}
