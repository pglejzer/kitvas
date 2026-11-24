// The name label on a hovered or selected element in the frame (plan 15): the JSX tag, and for the
// selected element its size. Pure parts first (name, text, place); the DOM part only sets what
// they answer. Names and numbers are code, so the frame needs no locale text.

import type { Point, Rect } from '../drag/place.ts';

/** The JSX tag of an element id: `sections/Hero:section/Stack/Button.2` is `Button`. */
export function labelName(id: string): string {
  const last = id.slice(id.lastIndexOf('/') + 1);
  // A root has no slash after its file stem: `Hero:section`.
  const tag = last.slice(last.indexOf(':') + 1);
  // The `.N` of the second and later copies of one slot; `Card.Header` has no digits.
  return tag.replace(/\.\d+$/, '');
}

export type LabelKind = 'hover' | 'select';

/** Hover: the name. Select: the name and the box, as `Stack · 320 × 48`. */
export function labelText(
  id: string,
  kind: LabelKind,
  box: { width: number; height: number },
): string {
  const name = labelName(id);
  if (kind === 'hover') return name;
  return `${name} · ${Math.round(box.width)} × ${Math.round(box.height)}`;
}

/**
 * Where a label goes, in page coordinates: just above the box and flush with its left edge, or
 * inside the box's top edge when there is no room above, and moved left to stay in the page.
 */
export function labelPlace(
  box: Rect,
  pageWidth: number,
  labelWidth: number,
  labelHeight: number,
): Point {
  const above = box.top - labelHeight;
  const top = above >= 0 ? above : box.top;
  const left = Math.max(0, Math.min(box.left, pageWidth - labelWidth));
  return { left, top };
}

/** The label's own look: tool chrome, not the design. */
export const LABEL_SHEET = `
.label {
  position: absolute; left: 0; top: 0; pointer-events: none; white-space: nowrap;
  transform-origin: 0 0;
  padding: 0 4px; font: 11px/1.4 system-ui, sans-serif;
  background: var(--kv-select, GrayText); color: var(--kv-on-select, Canvas);
}
.label[data-kind="select"] {
  background: var(--kv-select, Highlight); color: var(--kv-on-select, HighlightText);
}
@media (forced-colors: active) {
  .label { background: Highlight; color: HighlightText; }
}
`;

/** A drawn element: its id, its box in page coordinates (cut to the page as the outline is). */
export type LabelItem = {
  element: unknown;
  id: string | null;
  kind: LabelKind;
  box: Rect | undefined;
};

export type LabelView = {
  /** The overlay's own corner in page coordinates. */
  host: Point;
  pageWidth: number;
  /** The inverse of the canvas zoom, so a label keeps its size on screen. */
  scale: number;
};

/** The items that get a label: an element hovered and selected keeps the select one only. */
export function labelled(items: readonly LabelItem[]): (LabelItem & { id: string; box: Rect })[] {
  const selected = items.filter((item) => item.kind === 'select');
  const picked = new Set(selected.map((item) => item.element));
  const shown: (LabelItem & { id: string; box: Rect })[] = [];
  for (const item of items) {
    if (item.kind === 'hover' && picked.has(item.element)) continue;
    if (item.id !== null && item.box) shown.push({ ...item, id: item.id, box: item.box });
  }
  return shown;
}

/**
 * Writes one label per drawn item into `layer.labels`, making elements as needed, and hides the
 * rest. The scale grows a label from its top-left corner, which is where `labelPlace` puts it,
 * using the scaled size; the natural size is read with no transform.
 */
export function drawLabels(
  layer: { root: HTMLElement; labels: HTMLElement[] },
  items: readonly LabelItem[],
  view: LabelView,
): void {
  const shown = labelled(items);
  for (const [index, item] of shown.entries()) {
    let label = layer.labels[index];
    if (!label) {
      label = document.createElement('div');
      label.className = 'label';
      layer.root.append(label);
      layer.labels.push(label);
    }
    label.classList.remove('off');
    label.textContent = labelText(item.id, item.kind, item.box);
    label.dataset.kind = item.kind;
    label.style.transform = '';
    const width = label.offsetWidth * view.scale;
    const height = label.offsetHeight * view.scale;
    const place = labelPlace(item.box, view.pageWidth, width, height);
    label.style.left = `${place.left - view.host.left}px`;
    label.style.top = `${place.top - view.host.top}px`;
    if (view.scale !== 1) label.style.transform = `scale(${view.scale})`;
  }
  for (const label of layer.labels.slice(shown.length)) label.classList.add('off');
}
