// Small form controls for the properties panel (plan 13, task G; plan 15, task C). Each one
// calls back with the new value and sends nothing itself. Built with `createElement` and
// `textContent` only. `data-control` names what the panel focuses again after a redraw, and
// `data-initial` the value a field was drawn with, so a half-typed value can be put back.

import type { StyleProperty, StyleValue, TokenOption } from '../../../src/edit/index.ts';
import { MAX_SEGMENTS } from './props-kinds.ts';
import { lengthValue, readLength } from './props-units.ts';
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

/** An input drawn with `value`: the panel tells a half-typed value from it. */
function field(className: string, control: string, label: string, value: string) {
  const input: HTMLInputElement = el('input', className);
  input.dataset.control = control;
  input.setAttribute('aria-label', label);
  input.value = value;
  input.dataset.initial = value;
  return input;
}

export type SelectOption = { value: string; label: string };

/** A select for an enum prop. `data-control="main"` is what the panel refocuses after a redraw. */
export function selectControl(options: {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange(value: string): void;
}): HTMLSelectElement {
  const select = el('select', 'props-input');
  select.dataset.control = 'main';
  select.setAttribute('aria-label', options.label);
  select.disabled = options.disabled ?? false;
  const known = options.options.some((option) => option.value === options.value);
  const empty = { value: '', label: options.placeholder || text('props.choose') };
  const all = known ? options.options : [empty, ...options.options];
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
  const input = field('props-input', 'main', options.label, options.value);
  input.type = 'text';
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
  const drawn = options.value === null ? '' : String(options.value);
  const input = field('props-input', 'main', options.label, drawn);
  input.type = 'number';
  input.step = 'any';
  input.disabled = options.disabled ?? false;
  input.addEventListener('change', () => {
    const value = input.valueAsNumber;
    if (Number.isFinite(value)) options.onCommit(value);
    else input.value = drawn;
  });
  return input;
}

/**
 * Keywords as segmented buttons, or as a short list above `MAX_SEGMENTS`. `current` is the
 * keyword the source sets; `hint` the one the frame computes, marked when nothing is set.
 */
export function keywordControl(options: {
  label: string;
  keywords: readonly string[];
  current: string | null;
  hint: string;
  onPick(keyword: string): void;
}): HTMLElement {
  if (options.keywords.length > MAX_SEGMENTS) {
    return selectControl({
      label: options.label,
      value: options.current ?? '',
      options: options.keywords.map((keyword) => ({ value: keyword, label: keyword })),
      placeholder: options.hint,
      onChange: (keyword) => {
        if (keyword !== options.current) options.onPick(keyword);
      },
    });
  }
  const group = el('div', 'props-seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', options.label);
  for (const keyword of options.keywords) {
    const button = el('button', 'props-seg-item', keyword);
    button.type = 'button';
    button.dataset.control = `kw-${keyword}`;
    button.setAttribute('aria-pressed', String(keyword === options.current));
    if (options.current === null && keyword === options.hint) button.dataset.computed = '';
    button.addEventListener('click', () => {
      if (keyword !== options.current) options.onPick(keyword);
    });
    group.append(button);
  }
  return group;
}

/**
 * The background image: a file of the version's `src/img`, picked from a list. `current` is the
 * file the rule names; `shown` what to say when it names none of the list (another value).
 */
export function imageControl(options: {
  label: string;
  images: readonly string[];
  current: string | null;
  shown: string;
  onPick(file: string): void;
}): HTMLElement {
  if (options.images.length === 0) return el('span', 'props-note', text('props.image.none'));
  return selectControl({
    label: options.label,
    value: options.current ?? '',
    options: options.images.map((file) => ({ value: file, label: file })),
    placeholder: options.shown,
    onChange: (file) => {
      if (file !== options.current) options.onPick(file);
    },
  });
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

/**
 * A raw length: a number and a unit (px, rem, %, and `auto` where the property takes it). It
 * commits when either changes to something whole; an amount that is no number is marked.
 */
function lengthEditor(options: {
  property: StyleProperty;
  units: readonly string[];
  raw: string | null;
  onPick(value: StyleValue): void;
}): { root: HTMLElement; focus(): void; hidden(on: boolean): void } {
  const root = el('span', 'props-length');
  const read = options.raw === null ? null : readLength(options.raw);
  const amountText = read === null || read === 'auto' ? '' : String(read.amount);
  const unitNow = read === 'auto' ? 'auto' : (read?.unit ?? 'px');
  const label = text('props.custom.label', { property: options.property });
  const amount = field('props-input props-custom', 'custom', label, amountText);
  amount.inputMode = 'decimal';
  if (options.raw !== null && read === null) amount.placeholder = options.raw;
  const unit = el('select', 'props-input props-unit');
  unit.dataset.control = 'unit';
  unit.setAttribute('aria-label', text('props.unit', { property: options.property }));
  for (const name of options.units) {
    const item = el('option', undefined, name);
    item.value = name;
    unit.append(item);
  }
  unit.value = options.units.includes(unitNow) ? unitNow : (options.units[0] ?? 'px');
  const problem = el('span', 'props-problem', text('props.length.invalid'));
  problem.hidden = true;
  const commit = (): void => {
    amount.disabled = unit.value === 'auto';
    if (unit.value !== 'auto' && amount.value.trim() === '') return;
    const value = lengthValue(options.property, amount.value, unit.value);
    amount.setAttribute('aria-invalid', value === null ? 'true' : 'false');
    problem.hidden = value !== null;
    if (value !== null) options.onPick(value);
  };
  amount.disabled = unit.value === 'auto';
  amount.addEventListener('change', commit);
  unit.addEventListener('change', commit);
  root.append(amount, unit, problem);
  return {
    root,
    focus: () => (unit.value === 'auto' ? unit : amount).focus(),
    hidden: (on) => {
      root.hidden = on;
    },
  };
}

/** A free value: a colour, a number or a weight, checked by `parseRaw`. */
function rawEditor(options: {
  label: string;
  raw: string | null;
  onPick(value: StyleValue): void;
}): { root: HTMLElement; focus(): void; hidden(on: boolean): void } {
  const root = el('span', 'props-length');
  const label = text('props.custom.label', { property: options.label });
  const custom = field('props-input props-custom', 'custom', label, options.raw ?? '');
  custom.type = 'text';
  const problem = el('span', 'props-problem', text('props.custom.invalid'));
  problem.hidden = true;
  custom.addEventListener('change', () => {
    const raw = parseRaw(custom.value);
    custom.setAttribute('aria-invalid', raw === null ? 'true' : 'false');
    problem.hidden = raw !== null;
    if (raw !== null) options.onPick({ raw });
  });
  root.append(custom, problem);
  return {
    root,
    focus: () => custom.focus(),
    hidden: (on) => {
      root.hidden = on;
    },
  };
}

const RAW = '__raw';
const CUSTOM = '__custom';

/**
 * Opens the raw value editor of the token picker in `root`, as choosing "Custom…" does: a redraw
 * that keeps a half-typed raw value must show the field it is in.
 */
export function showCustom(root: Element): void {
  const select = root.querySelector('select[data-control="main"]');
  if (!(select instanceof HTMLSelectElement)) return;
  if (![...select.options].some((option) => option.value === CUSTOM)) return;
  if (select.value === CUSTOM || select.value === RAW) return;
  select.value = CUSTOM;
  select.dispatchEvent(new Event('change'));
}

/**
 * Kit tokens first, then "Custom…" for a raw value, which the caller marks off-kit. `current` is
 * the value now in the source; `placeholder` is what the frame computes when the source has none.
 * With `length`, the raw value is a number and a unit; without it, a free text field.
 */
export function tokenPicker(options: {
  label: string;
  tokens: TokenOption[];
  current: StyleValue | null;
  placeholder: string;
  disabled?: boolean;
  length?: { property: StyleProperty; units: readonly string[] };
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

  let current = options.current
    ? 'token' in options.current
      ? options.current.token
      : options.current.raw
    : options.placeholder || null;
  const pick = (value: StyleValue): void => {
    current = 'token' in value ? value.token : value.raw;
    options.onPick(value);
  };
  const editor = options.length
    ? lengthEditor({ ...options.length, raw: rawNow, onPick: pick })
    : rawEditor({ label: options.label, raw: rawNow, onPick: pick });
  const toggleEditor = (): void => editor.hidden(select.value !== CUSTOM && select.value !== RAW);
  toggleEditor();

  select.addEventListener('change', () => {
    toggleEditor();
    if (select.value === CUSTOM) editor.focus();
    else if (select.value !== '' && select.value !== RAW) pick({ token: select.value });
  });
  attachStepper(select, {
    tokens: options.tokens,
    getCurrent: () => current,
    onStep(token) {
      select.value = token.var;
      toggleEditor();
      pick({ token: token.var });
    },
  });
  root.append(select, editor.root);
  return root;
}
