// The header of the properties panel (plan 15, task C; spec goal 8): the path of the element's
// parents as crumbs that select on click, its name with a chip when it is a kit component, and
// buttons for the parent and the first child. With several elements selected it says how many.
// Plan 18 (task C): the path is one quiet clipped line; the suggestion is under the header
// (`view.ts`). Plan 18f (task 2, spec S4.6 item 1): a kit component has the kit's icon before its
// name; the file and line moved to the Source strip; what explains the whole element (several
// selected, a Tailwind draft, a spread) is an info mark whose tooltip says it, and a screen reader
// reads it there. The paths are pure over the editor's state; the DOM part is thin.

import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { icon, iconButton } from '../../ui/icon.ts';
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

/** The name line: an icon, a title, and what sits at its end (`.k-head`). */
function nameLine(
  name: string,
  before: HTMLElement | null,
  after: HTMLElement[],
  end: HTMLElement | null,
): HTMLElement {
  const line = el('div', 'k-head props-named');
  const ident = el('div', 'props-ident');
  const title = el('h3', 'props-tag k-clip', name);
  title.title = name;
  if (before !== null) ident.append(before);
  ident.append(title, ...after);
  line.append(ident);
  if (end !== null) line.append(end);
  return line;
}

/**
 * The info mark: the sentences as its tooltip, and as text a screen reader reads in place. A
 * shared tooltip that also opens on focus is not in the studio's base layer yet.
 */
function infoMark(sentences: readonly string[]): HTMLElement {
  const mark = el('span', 'props-info');
  mark.title = sentences.join('\n');
  mark.append(icon('info'), el('span', 'k-sr', sentences.join(' ')));
  return mark;
}

/** The kit's mark before a kit component's name; it says nothing the chip does not. */
function kitIcon(): HTMLElement {
  const mark = el('span', 'props-kit-icon');
  mark.append(icon('component'));
  return mark;
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

/**
 * The header of one element, or of several. `notes`: the sentences that explain the element as
 * a whole, behind the info mark.
 */
export function headerView(options: {
  state: Lineage;
  inspected: Inspect;
  count: number;
  select(id: string): void;
  notes?: readonly string[];
}): HTMLElement {
  const { inspected, count, select } = options;
  const notes = options.notes ?? [];
  const head = el('header', 'props-element');
  head.dataset.row = 'head';
  if (count > 1) {
    const info = infoMark([text('props.many.note'), ...notes]);
    head.append(nameLine(text('props.many', { count }), null, [info], null));
    return head;
  }
  const path = pathView(crumbsOf(options.state, inspected.id), select);
  if (path !== null) head.append(path);
  // A chip and the kit's icon only on a kit component: a plain element needs no mark.
  const after: HTMLElement[] = [];
  const kind = kindOf(inspected);
  if (kind === 'kit') {
    const chip = el('span', 'k-chip props-kind', text('props.kind.kit'));
    chip.dataset.kind = kind;
    after.push(chip);
  }
  if (notes.length > 0) after.push(infoMark(notes));
  const near = neighboursOf(options.state, inspected.id);
  const jump = el('div', 'props-jump');
  jump.append(navButton('parent', near.parent, select), navButton('child', near.child, select));
  head.append(nameLine(inspected.tag, kind === 'kit' ? kitIcon() : null, after, jump));
  return head;
}
