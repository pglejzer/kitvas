// Small form controls for the properties panel (plan 13, task G; plan 15, task C). Each one
// calls back with the new value and sends nothing itself. Built with `createElement` and
// `textContent` only. `data-control` names what the panel focuses again after a redraw, and
// `data-initial` the value a field was drawn with, so a half-typed value can be put back.
// Plan 18 (task C): the studio's shared controls (`.k-field`, `.k-seg`, `.k-switch`, `.k-swatch`);
// a row of keywords that all have an icon is drawn as icons (`keyword-icons.ts`).

import type { StyleProperty, StyleValue, TokenOption } from '../../../../src/edit/index.ts';
import { icon } from '../../ui/icon.ts';
import { type SelectItem, studioSelect } from '../../ui/select/select.ts';
import { text } from '../texts.ts';
import { el, field } from './custom/dom.ts';
import { listChoice } from './custom/memory.ts';
import { customEditor, type EditorKind } from './custom/raw-editors.ts';
import { segmentIcons } from './keyword-icons.ts';
import { MAX_SEGMENTS } from './kinds.ts';
import { stepToken } from './steps.ts';
import { tokenItems } from './token-items.ts';

export { el };

export type SelectOption = { value: string; label: string };

/** The words the studio select's search field and its empty list need. */
function searchWords(): { label: string; none: string } {
  return { label: text('props.select.search'), none: text('props.select.none') };
}

/** A plain item: a name for a value, no group, detail, swatch or warning. */
function plainItem(value: string, name: string): SelectItem {
  return { value, name, group: null, detail: null, swatch: null, warn: null };
}

/**
 * A studio select for an enum prop. `data-control="main"` (on its trigger) is what the panel
 * refocuses after a redraw. `onActive` hears the row under the pointer or the keys, `null` when
 * none; `onClose` hears every close (the panel draws again then).
 */
export function selectControl(options: {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange(value: string): void;
  onActive?(value: string | null): void;
  onClose?(): void;
}): HTMLElement {
  const known = options.options.some((option) => option.value === options.value);
  const picker = studioSelect({
    label: options.label,
    items: options.options.map((option) => plainItem(option.value, option.label)),
    value: known ? options.value : null,
    placeholder: options.placeholder || text('props.choose'),
    disabled: options.disabled ?? false,
    search: searchWords(),
    onPick: options.onChange,
    ...(options.onActive ? { onActive: options.onActive } : {}),
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  picker.root.classList.add('props-select');
  return picker.root;
}

export function checkboxControl(options: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}): HTMLInputElement {
  const box = el('input', 'k-switch props-toggle');
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
  const input = field('k-field props-text', 'main', options.label, options.value);
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
  const input = field('k-field props-number', 'main', options.label, drawn);
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
 * keyword the source sets; `hint` the one the frame computes, marked when nothing is set. When
 * every keyword of `property` has an icon the buttons show icons, each named by its keyword.
 */
export function keywordControl(options: {
  property: StyleProperty;
  label: string;
  keywords: readonly string[];
  current: string | null;
  hint: string;
  onPick(keyword: string): void;
  /** The list only: the keyword under the pointer or the keys, `null` when none. */
  onPreview?(keyword: string | null): void;
  /** The list only: it closed. */
  onClose?(): void;
  /** Plan 18f: the word a keyword is shown and named by (Layout's human rows); else itself. */
  name?(keyword: string): string;
}): HTMLElement {
  const nameOf = options.name ?? ((keyword: string): string => keyword);
  if (options.keywords.length > MAX_SEGMENTS) {
    return selectControl({
      label: options.label,
      value: options.current ?? '',
      options: options.keywords.map((keyword) => ({ value: keyword, label: nameOf(keyword) })),
      placeholder: options.hint,
      onChange: (keyword) => {
        if (keyword !== options.current) options.onPick(keyword);
      },
      ...(options.onPreview ? { onActive: options.onPreview } : {}),
      ...(options.onClose ? { onClose: options.onClose } : {}),
    });
  }
  const icons = segmentIcons(options.property, options.keywords);
  const group = el('div', icons === null ? 'k-seg props-words' : 'k-seg props-icons');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', options.label);
  for (const [index, keyword] of options.keywords.entries()) {
    const button = el('button');
    const glyph = icons?.[index];
    if (glyph === undefined) {
      button.textContent = nameOf(keyword);
    } else {
      // An icon alone: the keyword is its name and its tooltip.
      button.setAttribute('aria-label', nameOf(keyword));
      button.title = nameOf(keyword);
      button.append(icon(glyph));
    }
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
  /** The file under the pointer or the keys, `null` when none. */
  onPreview?(file: string | null): void;
  onClose?(): void;
}): HTMLElement {
  if (options.images.length === 0) return el('span', 'props-hint', text('props.image.none'));
  return selectControl({
    label: options.label,
    value: options.current ?? '',
    options: options.images.map((file) => ({ value: file, label: file })),
    placeholder: options.shown,
    onChange: (file) => {
      if (file !== options.current) options.onPick(file);
    },
    ...(options.onPreview ? { onActive: options.onPreview } : {}),
    ...(options.onClose ? { onClose: options.onClose } : {}),
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

const RAW = '__raw';
const CUSTOM = '__custom';

/**
 * Opens the raw value editor of the token picker in `root`, as choosing "Custom…" does: a redraw
 * that keeps a half-typed raw value must show the field it is in.
 */
export function showCustom(root: Element): void {
  root.querySelector('.props-picker')?.dispatchEvent(new Event('kv-show-custom'));
}

/**
 * The raw value first when the source holds one, then the kit's tokens, and "Custom…" as the
 * footer for a raw value, which the caller marks off-kit. `current` is the value now in the
 * source; `placeholder` is what the frame computes when the source has none. With `length`, the
 * raw value is a number and a unit; without it, a free text field. `warn` (spec 4c): the words of
 * a live check a token would fail, shown with a sign on its item. `colour`: its items get a
 * swatch, and the trigger shows it. `onPreview` hears the token under the pointer or the keys
 * (`null` for none, the raw value or "Custom…"); `onClose` hears every close of a list.
 */
export function tokenPicker(options: {
  label: string;
  tokens: TokenOption[];
  current: StyleValue | null;
  placeholder: string;
  disabled?: boolean;
  /** What "Custom" opens: the colour panel, a length, a weight or a plain number. */
  editor: EditorKind;
  warn?: (token: TokenOption) => string | null;
  /**
   * Plan 19 (task T5): the row's memory of an open "Custom" editor (`custom/memory.ts`). `open`
   * is what it holds now; the list's "Custom..." and a token pick tell it through `show` and
   * `hide`, so the redraw the list's close asks for draws the editor open.
   */
  custom?: { open: boolean; show(): void; hide(): void };
  /** The editor goes into this element (the row, for the colour panel) instead of under the list. */
  dock?: HTMLElement;
  onPick(value: StyleValue): void;
  onPreview?(value: StyleValue | null): void;
  onClose?(): void;
}): HTMLElement {
  const root = el('span', 'props-picker');
  const colour = options.editor.kind === 'colour';
  const rawNow = options.current && 'raw' in options.current ? options.current.raw : null;
  const items: SelectItem[] = [];
  if (rawNow !== null) {
    const swatch = colour ? rawNow : null;
    items.push({
      value: RAW,
      name: text('props.custom.name'),
      group: null,
      detail: rawNow,
      swatch,
      warn: null,
    });
  }
  items.push(
    ...tokenItems(options.tokens, { colour, ...(options.warn ? { warn: options.warn } : {}) }),
  );
  const wanted =
    options.current === null ? null : 'token' in options.current ? options.current.token : RAW;
  const known = wanted !== null && items.some((item) => item.value === wanted);
  // A raw value or a token the kit does not have shows the custom field, not a wrong token.
  let memoryOpen = options.custom?.open === true;
  let editorShown = memoryOpen || (wanted !== null && (wanted === RAW || !known));

  let current = options.current
    ? 'token' in options.current
      ? options.current.token
      : options.current.raw
    : options.placeholder || null;
  const hide = (): void => {
    editorShown = false;
    memoryOpen = false;
    editor.hidden(true);
    options.custom?.hide();
  };
  const pick = (value: StyleValue): void => {
    current = 'token' in value ? value.token : value.raw;
    // A token ends the editor; a typed value leaves it open for the next one.
    if ('token' in value) hide();
    options.onPick(value);
  };
  // Where a "Custom" editor starts: the raw value, else the token's own value, else the frame's.
  const tokenNow = options.current && 'token' in options.current ? options.current.token : null;
  const start =
    options.tokens.find((token) => token.var === tokenNow)?.css ?? (options.placeholder || null);
  const editor = customEditor({
    label: options.label,
    kind: options.editor,
    tokens: options.tokens,
    raw: rawNow,
    start,
    onPreview: (value) => options.onPreview?.(value),
    onPick: pick,
  });
  editor.hidden(!editorShown);

  const picker = studioSelect({
    label: options.label,
    items,
    value: known ? wanted : null,
    placeholder: options.placeholder || text('props.choose'),
    disabled: options.disabled ?? false,
    footer: { value: CUSTOM, name: text('props.custom') },
    search: searchWords(),
    // The stepper stays on the trigger: the arrow keys walk the scale, not the list.
    stepKeys: false,
    onPick(value) {
      const choice = listChoice(value, memoryOpen, { custom: CUSTOM, raw: RAW });
      if (choice === 'hide') {
        hide();
      } else if (choice === 'show') {
        editorShown = true;
        editor.hidden(false);
        if (value === CUSTOM) {
          memoryOpen = true;
          options.custom?.show();
        }
        editor.focus();
      } else {
        pick({ token: value });
      }
    },
    onActive(value) {
      const token = value === null || value === RAW || value === CUSTOM ? null : value;
      options.onPreview?.(token === null ? null : { token });
    },
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  picker.root.classList.add('props-select');
  attachStepper(picker.trigger, {
    tokens: options.tokens,
    getCurrent: () => current,
    onStep(token) {
      picker.show(token.var);
      pick({ token: token.var });
    },
  });
  // A redraw that kept a half-typed raw value asks for the field it was typed in.
  root.addEventListener('kv-show-custom', () => {
    if (editorShown) return;
    editorShown = true;
    editor.hidden(false);
    editor.focus();
  });
  const line = el('span', 'props-pick-line');
  line.append(picker.root);
  root.append(line);
  if (options.dock) options.dock.append(editor.root);
  else root.append(editor.root);
  return root;
}
