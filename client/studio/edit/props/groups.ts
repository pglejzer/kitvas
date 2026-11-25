// The groups of the properties panel (plan 15, task C; spec goal 8; plan 18f, task 2): Component,
// Text, Layout, Radius, Spacing, Size, Typography, Background, Border and Accessibility, in that
// order. Each folds, and so does "All layout properties" inside Layout; the folds are kept per
// viewer in `localStorage`, every read and write guarded: the panel works without it. A fold that
// starts folded (Accessibility, the raw layout rows) is kept as the viewer opening it.

import type { StyleProperty } from '../../../../src/edit/index.ts';
import { icon } from '../../ui/icon.ts';
import { el } from './controls.ts';

export const GROUPS = [
  'component',
  'text',
  'layout',
  'radius',
  'spacing',
  'size',
  'typography',
  'background',
  'border',
  'a11y',
] as const;
export type GroupId = (typeof GROUPS)[number];
export type StyleGroup = Exclude<GroupId, 'component' | 'text' | 'a11y'>;

/** Everything that folds: the groups, and the raw rows of Layout. */
export const FOLDS = [...GROUPS, 'layout-all'] as const;
export type FoldId = (typeof FOLDS)[number];

/** What starts folded: the person opens it. Their stored fold says they turned it. */
export const FOLDED_FIRST: ReadonlySet<FoldId> = new Set<FoldId>(['a11y', 'layout-all']);

/**
 * The style rows of each group, in the order the panel shows them. Spacing's sides and axes are
 * the box model's; Layout's keywords and gap are its raw rows, under its rows with human labels;
 * every style property is in exactly one group.
 */
export const STYLE_GROUPS: Record<StyleGroup, readonly StyleProperty[]> = {
  layout: [
    'display',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'align-self',
    'text-align',
    'gap',
  ],
  radius: ['border-radius'],
  spacing: [
    'margin',
    'margin-block',
    'margin-inline',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'padding',
    'padding-block',
    'padding-inline',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
  ],
  size: ['width', 'height', 'min-width', 'min-height'],
  typography: ['font-size', 'font-weight', 'line-height', 'color'],
  background: ['background-color', 'background-image', 'background-size'],
  border: [
    'border-color',
    'border-width',
    'border-style',
    'outline-color',
    'outline-width',
    'outline-style',
  ],
};

const STYLE_GROUP_IDS: readonly StyleGroup[] = [
  'layout',
  'radius',
  'spacing',
  'size',
  'typography',
  'background',
  'border',
];

/** The group a style property is shown in; `null` for none (a test holds that none is left). */
export function groupOf(property: StyleProperty): StyleGroup | null {
  return STYLE_GROUP_IDS.find((group) => STYLE_GROUPS[group].includes(property)) ?? null;
}

const isFold = (id: unknown): id is FoldId =>
  typeof id === 'string' && (FOLDS as readonly string[]).includes(id);

/** The part of `localStorage` the folds use; replaceable in tests. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const FOLDS_KEY = 'kitvas.props.folded';

/** The viewer's storage, or `null` where reading it throws (blocked site data, a sandbox). */
export function viewerStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The folds the viewer turned from how they start; none when the storage is missing, broken or
 * holds junk. For a group that starts open that is "folded", as it always was.
 */
export function readFolds(storage: StorageLike | null): Set<FoldId> {
  try {
    const read: unknown = JSON.parse(storage?.getItem(FOLDS_KEY) ?? '[]');
    return new Set(Array.isArray(read) ? read.filter(isFold) : []);
  } catch {
    return new Set();
  }
}

/** Keeps the folds; a storage that refuses the write leaves them for this page only. */
export function writeFolds(storage: StorageLike | null, folds: ReadonlySet<FoldId>): void {
  try {
    storage?.setItem(FOLDS_KEY, JSON.stringify(FOLDS.filter((id) => folds.has(id))));
  } catch {
    // Kept in memory only.
  }
}

/** The folds with `id` turned. */
export function toggleFold(folds: ReadonlySet<FoldId>, id: FoldId): Set<FoldId> {
  const next = new Set(folds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Whether `id` is folded now: as it starts, unless the viewer turned it. */
export const isFolded = (folds: ReadonlySet<FoldId>, id: FoldId): boolean =>
  folds.has(id) !== FOLDED_FIRST.has(id);

/** The heading button of a fold, its chevron first; `chip` sits at its end (a status). */
function foldHead(
  className: string,
  fold: { title: string; folded: boolean; onToggle(): void },
  body: HTMLElement,
  chip: HTMLElement | null,
): HTMLButtonElement {
  const button = el('button', className);
  button.type = 'button';
  button.dataset.control = 'fold';
  button.setAttribute('aria-expanded', String(!fold.folded));
  button.setAttribute('aria-controls', body.id);
  button.append(icon('chevron-down'), el('span', 'k-clip', fold.title));
  if (chip !== null) button.append(chip);
  button.addEventListener('click', () => fold.onToggle());
  body.hidden = fold.folded;
  return button;
}

/**
 * One group: a heading button that folds it and a body with its rows. `data-row` and
 * `data-control` let the panel give the button its focus back after a redraw. Plan 18: the
 * shared foldable group (`.k-group`, `.k-group-head` with its chevron). Plan 18f: a `chip` on the
 * heading says a status that stays seen while the group is folded (Accessibility's problems).
 */
export function groupView(options: {
  id: GroupId;
  title: string;
  folded: boolean;
  rows: readonly HTMLElement[];
  onToggle(): void;
  chip?: HTMLElement | null;
}): HTMLElement {
  const section = el('section', 'k-group props-block');
  section.dataset.group = options.id;
  const heading = el('h4', 'props-block-title');
  heading.dataset.row = `group:${options.id}`;
  const body = el('div', 'props-block-rows');
  body.id = `props-group-${options.id}`;
  body.append(...options.rows);
  heading.append(foldHead('k-group-head', options, body, options.chip ?? null));
  section.append(heading, body);
  return section;
}

/** A fold inside a group ("All layout properties"): a quieter heading over its rows. */
export function subFoldView(options: {
  id: Exclude<FoldId, GroupId>;
  title: string;
  folded: boolean;
  rows: readonly HTMLElement[];
  onToggle(): void;
}): HTMLElement {
  const box = el('div', 'props-subfold');
  // A container the redraw patches row by row (`patch.ts`), as a group is.
  box.dataset.group = options.id;
  const heading = el('div', 'props-subfold-title');
  heading.dataset.row = `fold:${options.id}`;
  const body = el('div', 'props-block-rows');
  body.id = `props-fold-${options.id}`;
  body.append(...options.rows);
  heading.append(foldHead('k-group-head props-subfold-head', options, body, null));
  box.append(heading, body);
  return box;
}
