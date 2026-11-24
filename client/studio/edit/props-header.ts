// The header of the properties panel (plan 15, task C; spec goal 8): the element's name and a
// kind chip (kit component or HTML element), its file and line, the path of its parents as
// crumbs that select on click, and buttons for the parent and the first child. With several
// elements selected it says how many and that the rows are the ones they share. The paths are
// pure over the editor's state; the DOM part is thin.

import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import { el } from './controls.ts';
import { firstChildOf, parentOf, tagOfId } from './selection.ts';
import type { EditorState } from './store.ts';
import { text } from './texts.ts';

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

function navButton(
  control: 'parent' | 'child',
  target: string | null,
  select: (id: string) => void,
): HTMLButtonElement {
  const button = el('button', 'props-nav-button', text(`props.${control}`));
  button.type = 'button';
  button.dataset.control = control;
  button.title = text(`props.${control}.label`);
  button.disabled = target === null;
  button.addEventListener('click', () => {
    if (target !== null) select(target);
  });
  return button;
}

/** The header of one element, or of several. */
export function headerView(options: {
  state: Lineage;
  inspected: Inspect;
  count: number;
  select(id: string): void;
}): HTMLElement {
  const { inspected, count, select } = options;
  const head = el('header', 'props-head');
  head.dataset.row = 'head';
  if (count > 1) {
    head.append(
      el('h3', 'props-name', text('props.many', { count })),
      el('p', 'props-note', text('props.many.note')),
    );
    return head;
  }
  const title = el('div', 'props-title');
  const kind = kindOf(inspected);
  const chip = el('span', 'props-chip', text(`props.kind.${kind}`));
  chip.dataset.kind = kind;
  title.append(el('h3', 'props-name', inspected.tag), chip);
  const place = el('p', 'props-place');
  place.append(el('code', undefined, placeOf(inspected)));
  head.append(title, place);

  const crumbs = crumbsOf(options.state, inspected.id);
  if (crumbs.length > 0) {
    const nav = el('nav', 'props-crumbs');
    nav.setAttribute('aria-label', text('props.crumbs'));
    for (const crumb of crumbs) {
      const button = el('button', 'props-crumb', crumb.label);
      button.type = 'button';
      button.dataset.control = `crumb-${crumb.id}`;
      button.title = text('props.crumb.label', { name: crumb.label });
      button.addEventListener('click', () => select(crumb.id));
      nav.append(button);
    }
    head.append(nav);
  }
  const near = neighboursOf(options.state, inspected.id);
  const buttons = el('div', 'props-nav');
  buttons.append(navButton('parent', near.parent, select), navButton('child', near.child, select));
  head.append(buttons);
  return head;
}
