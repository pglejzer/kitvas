// The groups of the properties panel (plan 15, task C; spec goal 8): Component, Text, Layout,
// Spacing, Size, Typography, Background and Border, in that order. Each folds, and the folds are
// kept per viewer in `localStorage`, every read and write guarded: the panel works without it.

import type { StyleProperty } from '../../../../src/edit/index.ts';
import { el } from './controls.ts';

export const GROUPS = [
  'component',
  'text',
  'layout',
  'spacing',
  'size',
  'typography',
  'background',
  'border',
] as const;
export type GroupId = (typeof GROUPS)[number];
export type StyleGroup = Exclude<GroupId, 'component' | 'text'>;

/**
 * The style rows of each group, in the order the panel shows them. Spacing's sides and axes are
 * the box model's; every style property is in exactly one group.
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
  ],
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
    'gap',
  ],
  size: ['width', 'height'],
  typography: ['font-size', 'font-weight', 'line-height', 'color'],
  background: ['background-color', 'background-image', 'background-size'],
  border: [
    'border-color',
    'border-width',
    'border-style',
    'border-radius',
    'outline-color',
    'outline-width',
    'outline-style',
  ],
};

const STYLE_GROUP_IDS: readonly StyleGroup[] = [
  'layout',
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

const isGroup = (id: unknown): id is GroupId =>
  typeof id === 'string' && (GROUPS as readonly string[]).includes(id);

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

/** The groups the viewer folded; none when the storage is missing, broken or holds junk. */
export function readFolds(storage: StorageLike | null): Set<GroupId> {
  try {
    const read: unknown = JSON.parse(storage?.getItem(FOLDS_KEY) ?? '[]');
    return new Set(Array.isArray(read) ? read.filter(isGroup) : []);
  } catch {
    return new Set();
  }
}

/** Keeps the folds; a storage that refuses the write leaves them for this page only. */
export function writeFolds(storage: StorageLike | null, folds: ReadonlySet<GroupId>): void {
  try {
    storage?.setItem(FOLDS_KEY, JSON.stringify(GROUPS.filter((id) => folds.has(id))));
  } catch {
    // Kept in memory only.
  }
}

/** The folds with `id` folded or opened. */
export function toggleFold(folds: ReadonlySet<GroupId>, id: GroupId): Set<GroupId> {
  const next = new Set(folds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * One group: a heading button that folds it and a body with its rows. `data-row` and
 * `data-control` let the panel give the button its focus back after a redraw.
 */
export function groupView(options: {
  id: GroupId;
  title: string;
  folded: boolean;
  rows: readonly HTMLElement[];
  onToggle(): void;
}): HTMLElement {
  const section = el('section', 'props-group');
  section.dataset.group = options.id;
  const heading = el('h4', 'props-group-head');
  heading.dataset.row = `group:${options.id}`;
  const button = el('button', 'props-fold', options.title);
  button.type = 'button';
  button.dataset.control = 'fold';
  button.setAttribute('aria-expanded', String(!options.folded));
  const body = el('div', 'props-group-body');
  body.id = `props-group-${options.id}`;
  button.setAttribute('aria-controls', body.id);
  body.hidden = options.folded;
  body.append(...options.rows);
  button.addEventListener('click', () => options.onToggle());
  heading.append(button);
  section.append(heading, body);
  return section;
}
