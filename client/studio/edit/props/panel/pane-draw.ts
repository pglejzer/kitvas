// How the properties pane lays its parts down (moved out of `panel.ts` in plan 18f, task 2): the
// line in place of the rows, the rise of a new selection's rows, the focus and the half-typed
// value a redraw keeps, and the fill of a part, replaced whole or patched row by row.

import { el, showCustom } from '../controls/controls.ts';
import { patchChildren } from './patch.ts';

/** A line in place of the rows: nothing selected, too many, or the element still being read. */
export function emptyView(...lines: string[]): HTMLElement {
  const box = el('div', 'k-empty');
  const [first, ...rest] = lines;
  if (first !== undefined) box.append(el(rest.length > 0 ? 'strong' : 'p', undefined, first));
  for (const line of rest) box.append(el('p', undefined, line));
  return box;
}

/**
 * Starts an element's entrance again (`.k-rise`), as when it was just shown. An element not shown
 * now (another tab, a folded panel) does not rise: it comes in with its pane when that is shown.
 */
export function rise(node: HTMLElement): void {
  node.classList.remove('k-rise');
  // Reading the layout ends the old animation, so the class starts a new one.
  if (node.getClientRects().length === 0) return;
  node.classList.add('k-rise');
}

/** The entrance's class goes once it has run, so showing the pane later does not run it again. */
export function settle(node: HTMLElement): void {
  const done = (event: Event): void => {
    if (event.target === node) node.classList.remove('k-rise');
  };
  node.addEventListener('animationend', done);
  node.addEventListener('animationcancel', done);
}

/** The focused control of the panel, and the text typed into it that was not sent yet. */
export type Kept = {
  row: string;
  control: string;
  typed: string | null;
  caret: [number, number] | null;
};

export function keptFocus(section: HTMLElement): Kept | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !section.contains(active)) return null;
  const row = active.closest<HTMLElement>('[data-row]')?.dataset.row;
  const control = active.dataset.control;
  if (!row || !control) return null;
  if (!(active instanceof HTMLInputElement)) return { row, control, typed: null, caret: null };
  const initial = active.dataset.initial;
  const typed = initial !== undefined && active.value !== initial ? active.value : null;
  // A number field has no caret to read.
  const { selectionStart, selectionEnd } = active;
  const caret: [number, number] | null =
    selectionStart === null || selectionEnd === null ? null : [selectionStart, selectionEnd];
  return { row, control, typed, caret };
}

export function restoreFocus(section: HTMLElement, kept: Kept | null): void {
  if (kept === null) return;
  const row = section.querySelector<HTMLElement>(`[data-row="${CSS.escape(kept.row)}"]`);
  const selector = `[data-control="${CSS.escape(kept.control)}"]`;
  const found = row?.querySelector<HTMLElement>(selector);
  if (!row || !found) return;
  // A half-typed raw value lives in the picker's custom field, which a redraw draws closed.
  if (kept.typed !== null && found.closest('[hidden]')) showCustom(row);
  found.focus();
  if (!(found instanceof HTMLInputElement)) return;
  if (kept.typed !== null) found.value = kept.typed;
  try {
    if (kept.caret) found.setSelectionRange(kept.caret[0], kept.caret[1]);
  } catch {
    // A field type without a caret: the focus is enough.
  }
}

/**
 * The cursor goes into the "Custom" editor of `row` (plan 19, task T5): the one control of the
 * editor that says `data-editor-focus`. A redraw has drawn the row by now.
 */
export function focusCustom(section: HTMLElement, row: string): void {
  const entry = section.querySelector<HTMLElement>(`[data-row="${CSS.escape(row)}"]`);
  // The editor comes in once, now that it was opened: the draws that put a new one in its place
  // (after every write, after every answer of the live checks) show it still, so it never bobs.
  const editor = entry?.querySelector<HTMLElement>('[data-custom-editor]');
  if (editor && !editor.closest('[hidden]')) editor.dataset.entering = '';
  const target = entry?.querySelector<HTMLElement>('[data-editor-focus]:not(:disabled)');
  if (!target || target.closest('[hidden]')) return;
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
}

/**
 * The cursor goes back to what opened the "Custom" editor of `row` after Escape closed it: the
 * row's "Custom..." button, else its list.
 */
export function focusOpener(section: HTMLElement, row: string): void {
  const entry = section.querySelector<HTMLElement>(`[data-row="${CSS.escape(row)}"]`);
  const target =
    entry?.querySelector<HTMLElement>('[data-control="custom"]') ??
    entry?.querySelector<HTMLElement>('[role="combobox"]');
  if (!target || target.closest('[hidden]')) return;
  target.focus();
}

/** Fills a box: replaced whole for a new selection, else laid over what it holds (`patch.ts`). */
export function fill(into: HTMLElement, nodes: readonly HTMLElement[], replace: boolean): void {
  if (replace) {
    into.replaceChildren(...nodes);
    return;
  }
  const next = el('div');
  next.append(...nodes);
  patchChildren(into, next);
}
