// The header of the properties panel (plan 15, task C; spec goal 8): the path of the element's
// parents as crumbs that select on click, its name with a chip when it is a kit component,
// buttons for the parent and the first child, and its file and line. With several elements
// selected it says how many and that the rows are the ones they share. Plan 18 (task C): the path
// is one quiet clipped line; the suggestion is under the header (`view.ts`). The paths are pure
// over the editor's state; the DOM part is thin.

import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { iconButton } from '../../ui/icon.ts';
import { firstChildOf, parentOf, tagOfId } from '../select/selection.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { el } from './controls.ts';

export type Crumb = { id: string; label: string };

/** Deeper than this is a loop in the data, never a page. */
const MAX_DEPTH = 200;

type Lineage = Pick<EditorState, 'structure' | 'tree'>;

/** The parent of `id`: from the source's structure, else from the frame's tree. */
function parentId(state: Lineage, id: string): string | null {
  const entry = state.structure?.elements.find((one) => one.id === id);
  if (entry !== undefined) return entry.parent;
  return parentOf(state.tree, id);
}

/** The label of a crumb: the element's tag as the source writes it. */
function labelOf(state: Lineage, id: string): string {
  return state.structure?.elements.find((one) => one.id === id)?.tag ?? tagOfId(id);
}

/** The parents of `id`, the outermost first. */
export function crumbsOf(state: Lineage, id: string): Crumb[] {
  const crumbs: Crumb[] = [];
  const seen = new Set([id]);
  let at = parentId(state, id);
  while (at !== null && !seen.has(at) && crumbs.length < MAX_DEPTH) {
    seen.add(at);
    crumbs.unshift({ id: at, label: labelOf(state, at) });
    at = parentId(state, at);
  }
  return crumbs;
}

/** The parent and the first child of `id`, for the two buttons; `null` where there is none. */
export function neighboursOf(
  state: Lineage,
  id: string,
): {
  parent: string | null;
  child: string | null;
} {
  const elements = state.structure?.elements;
  const child = elements
    ? (elements.find((one) => one.parent === id)?.id ?? null)
    : firstChildOf(state.tree, id);
  return { parent: parentId(state, id), child };
}

/** A kit component, a part of one included, or an HTML element. */
export const kindOf = (view: Pick<Inspect, 'component'>): 'kit' | 'html' =>
  view.component === null ? 'html' : 'kit';

/** Where the element is written: `src/tsx/sections/Hero.tsx:12`, or the file alone. */
export const placeOf = (view: Pick<Inspect, 'file' | 'line'>): string =>
  view.line === undefined ? view.file : `${view.file}:${view.line}`;

/** Parent and First child: icon buttons whose name and tooltip say what they select. */
function navButton(
  control: 'parent' | 'child',
  target: string | null,
  select: (id: string) => void,
): HTMLButtonElement {
  const glyph = control === 'parent' ? 'arrow-up' : 'arrow-down';
  const button = iconButton(glyph, text(`props.${control}.label`));
  button.dataset.control = control;
  button.disabled = target === null;
  button.addEventListener('click', () => {
    if (target !== null) select(target);
  });
  return button;
}

/** The name line: a title, and what sits at its end (`.k-head`). */
function nameLine(name: string, after: HTMLElement[], end: HTMLElement | null): HTMLElement {
  const line = el('div', 'k-head props-named');
  const ident = el('div', 'props-ident');
  const title = el('h3', 'props-tag k-clip', name);
  title.title = name;
  ident.append(title, ...after);
  line.append(ident);
  if (end !== null) line.append(end);
  return line;
}

/** The parents as one line of crumbs; `null` for an element without any. */
function pathView(crumbs: readonly Crumb[], select: (id: string) => void): HTMLElement | null {
  if (crumbs.length === 0) return null;
  const nav = el('nav', 'props-path');
  nav.setAttribute('aria-label', text('props.crumbs'));
  for (const crumb of crumbs) {
    const button = el('button', 'props-path-step', crumb.label);
    button.type = 'button';
    button.dataset.control = `crumb-${crumb.id}`;
    button.title = text('props.crumb.label', { name: crumb.label });
    button.addEventListener('click', () => select(crumb.id));
    nav.append(button);
  }
  return nav;
}

/** The header of one element, or of several. */
export function headerView(options: {
  state: Lineage;
  inspected: Inspect;
  count: number;
  select(id: string): void;
}): HTMLElement {
  const { inspected, count, select } = options;
  const head = el('header', 'props-element');
  head.dataset.row = 'head';
  if (count > 1) {
    head.append(
      nameLine(text('props.many', { count }), [], null),
      el('p', 'props-hint', text('props.many.note')),
    );
    return head;
  }
  const path = pathView(crumbsOf(options.state, inspected.id), select);
  if (path !== null) head.append(path);
  // A chip only on a kit component: a plain element needs no mark.
  const after: HTMLElement[] = [];
  const kind = kindOf(inspected);
  if (kind === 'kit') {
    const chip = el('span', 'k-chip props-kind', text('props.kind.kit'));
    chip.dataset.kind = kind;
    after.push(chip);
  }
  const near = neighboursOf(options.state, inspected.id);
  const jump = el('div', 'props-jump');
  jump.append(navButton('parent', near.parent, select), navButton('child', near.child, select));
  const where = placeOf(inspected);
  const place = el('p', 'k-meta k-clip props-file');
  place.title = where;
  place.append(el('code', undefined, where));
  head.append(nameLine(inspected.tag, after, jump), place);
  return head;
}
