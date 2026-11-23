// Small form controls for the properties panel (plan 13, task G). Each one calls back with the
// new value and sends nothing itself. Built with `createElement` and `textContent` only.

import type { StyleValue, TokenOption } from '../../../src/edit/index.ts';
import { parseRaw, stepToken } from './steps.ts';
import { text } from './texts.ts';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export type SelectOption = { value: string; label: string };

/** A select for an enum prop. `data-control="main"` marks what the panel refocuses after a redraw. */
export function selectControl(options: {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange(value: string): void;
}): HTMLSelectElement {
  const select = el('select', 'props-input');
  select.dataset.control = 'main';
  select.setAttribute('aria-label', options.label);
  select.disabled = options.disabled ?? false;
  const known = options.options.some((option) => option.value === options.value);
  const all = known
    ? options.options
    : [{ value: '', label: text('props.choose') }, ...options.options];
  for (const option of all) {
    const item = el('option', undefined, option.label);
    item.value = option.value;
    select.append(item);
  }
  select.value = known ? options.value : '';
  select.addEventListener('change', () => {
    if (select.value !== '') options.onChange(select.value);
  });
  return select;
}

export function checkboxControl(options: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}): HTMLInputElement {
  const box = el('input', 'props-check');
  box.type = 'checkbox';
  box.dataset.control = 'main';
  box.setAttribute('aria-label', options.label);
  box.checked = options.checked;
  box.disabled = options.disabled ?? false;
  box.addEventListener('change', () => options.onChange(box.checked));
  return box;
}

/** A text field that commits on Enter or blur (the `change` event); Escape puts the value back. */
export function textControl(options: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit(value: string): void;
}): HTMLInputElement {
  const input = el('input', 'props-input');
  input.type = 'text';
  input.dataset.control = 'main';
  input.setAttribute('aria-label', options.label);
  input.value = options.value;
  input.disabled = options.disabled ?? false;
  input.addEventListener('change', () => options.onCommit(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') input.value = options.value;
  });
  return input;
}

/** A number field; a value that is not a finite number is put back instead of sent. */
export function numberControl(options: {
  label: string;
  value: number | null;
  disabled?: boolean;
  onCommit(value: number): void;
}): HTMLInputElement {
  const input = el('input', 'props-input');
  input.type = 'number';
  input.step = 'any';
  input.dataset.control = 'main';
  input.setAttribute('aria-label', options.label);
  input.value = options.value === null ? '' : String(options.value);
  input.disabled = options.disabled ?? false;
  input.addEventListener('change', () => {
    const value = input.valueAsNumber;
    if (Number.isFinite(value)) options.onCommit(value);
    else input.value = options.value === null ? '' : String(options.value);
  });
  return input;
}

/**
 * Arrow keys step through the scale (Shift: three steps). `getCurrent` answers with the value the
 * last step asked for, so a held key keeps going from there without waiting for the build.
 */
export function attachStepper(
  target: HTMLElement,
  options: {
    tokens: readonly TokenOption[];
    getCurrent(): string | null;
    onStep(token: TokenOption): void;
  },
): void {
  target.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const next = stepToken(options.tokens, options.getCurrent(), direction, event.shiftKey);
    if (next) options.onStep(next);
  });
}

const RAW = '__raw';
const CUSTOM = '__custom';

/**
 * Kit tokens first, then "Custom…" for a raw value, which the caller marks off-kit. `current` is the
 * value now in the source; `placeholder` is what the frame computes when the source has none.
 */
export function tokenPicker(options: {
  label: string;
  tokens: TokenOption[];
  current: StyleValue | null;
  placeholder: string;
  disabled?: boolean;
  onPick(value: StyleValue): void;
}): HTMLElement {
  const root = el('span', 'props-token');
  const select = el('select', 'props-input');
  select.dataset.control = 'main';
  select.setAttribute('aria-label', options.label);
  select.disabled = options.disabled ?? false;
  const rawNow = options.current && 'raw' in options.current ? options.current.raw : null;
  const add = (value: string, label: string): void => {
    const item = el('option', undefined, label);
    item.value = value;
    select.append(item);
  };
  if (!options.current) add('', options.placeholder || text('props.choose'));
  for (const token of options.tokens) add(token.var, `${token.path} · ${token.css}`);
  if (rawNow !== null) add(RAW, rawNow);
  add(CUSTOM, text('props.custom'));
  const wanted =
    options.current === null ? '' : 'token' in options.current ? options.current.token : RAW;
  select.value = wanted;
  // A token the kit does not have: show the custom field rather than the wrong token.
  if (select.value !== wanted) select.value = CUSTOM;

  const custom = el('input', 'props-input props-custom');
  custom.type = 'text';
  custom.dataset.control = 'custom';
  custom.setAttribute('aria-label', text('props.custom.label', { property: options.label }));
  custom.value = rawNow ?? '';
  const problem = el('span', 'props-problem', text('props.custom.invalid'));
  problem.hidden = true;
  const showCustom = (): void => {
    custom.hidden = select.value !== CUSTOM && select.value !== RAW;
  };
  showCustom();

  let current = options.current
    ? 'token' in options.current
      ? options.current.token
      : options.current.raw
    : options.placeholder || null;
  select.addEventListener('change', () => {
    showCustom();
    if (select.value === CUSTOM) custom.focus();
    else if (select.value !== '' && select.value !== RAW) {
      current = select.value;
      options.onPick({ token: select.value });
    }
  });
  custom.addEventListener('change', () => {
    const raw = parseRaw(custom.value);
    custom.setAttribute('aria-invalid', raw === null ? 'true' : 'false');
    problem.hidden = raw !== null;
    if (raw === null) return;
    current = raw;
    options.onPick({ raw });
  });
  attachStepper(select, {
    tokens: options.tokens,
    getCurrent: () => current,
    onStep(token) {
      current = token.var;
      select.value = token.var;
      showCustom();
      options.onPick({ token: token.var });
    },
  });
  root.append(select, custom, problem);
  return root;
}
