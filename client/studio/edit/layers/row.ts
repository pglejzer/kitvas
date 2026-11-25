// One row of the Layers tree (plan 18, task B). Built with `createElement` and `textContent` only:
// names come from the page being edited. The row's name button carries every hook the tree's drag,
// keys and menu read (`data-layer`, `data-section`, the `layers-row` class); lock and hide are
// icon buttons at its end, shown on hover, on focus and always when on (the skin).

import { addsToSelection, type TreeNode } from '../../../channel/edit-protocol.ts';
import { icon, iconButton } from '../../ui/icon.ts';
import type { ListKind } from '../structure/lists.ts';
import { text } from '../texts.ts';
import { badgeOf, type LayerItem, rowFacts } from './facts.ts';
import { layerName, type NamedEntry, sectionLabel } from './names.ts';

export type Section = { id: string; purpose: string };

/** What a row needs to know of the page and to tell it; `layers.ts` fills it in. */
export type RowEnv = {
  selected: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  locked: ReadonlySet<string>;
  sections: ReadonlyMap<string, Section>;
  components: ReadonlyMap<string, string | null>;
  /** The component and the tag of each element the structure lists: what its row is called. */
  named: ReadonlyMap<string, NamedEntry>;
  changed: ReadonlySet<string>;
  kindOf(id: string): ListKind | null;
  /** A drag ends with a click on the row it started on; that click must not select. */
  swallowClick(): boolean;
  select(id: string, add: boolean): void;
  press(node: TreeNode, section: string | null, event: PointerEvent): void;
  hover(id: string | null): void;
  toggleHidden(id: string): void;
  toggleLocked(id: string): void;
  /** Whether a row with children at `level` draws them (`folds.ts`). */
  open(id: string, level: number): boolean;
  /** The search field has text: every row is drawn open and the chevrons rest. */
  searching: boolean;
  /** A click on a chevron; `whole` (Alt) folds or opens the row's whole subtree. */
  toggle(item: LayerItem, level: number, whole: boolean): void;
};

/**
 * The name a row shows: the section's name in sentence case for a section row, else what the
 * element is (`names.ts`). The element's text is the tooltip, never the name.
 */
function shownName(item: LayerItem, level: number, env: RowEnv): string {
  const asSection = level === 1 ? env.sections.get(item.node.id) : undefined;
  return asSection ? sectionLabel(asSection.id) : layerName(env.named.get(item.node.id), item.node);
}

/** The disclosure chevron of a row with children, or a spacer of the same width without. */
function twist(item: LayerItem, level: number, open: boolean, env: RowEnv): HTMLElement {
  if (item.children.length === 0) {
    const gap = document.createElement('span');
    gap.className = 'layers-twist layers-twist-gap';
    gap.setAttribute('aria-hidden', 'true');
    return gap;
  }
  const label = text(open ? 'layers.collapse' : 'layers.expand', {
    name: shownName(item, level, env),
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'layers-twist';
  button.dataset.twist = item.node.id;
  button.tabIndex = -1;
  button.disabled = env.searching;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', String(open));
  button.append(icon(open ? 'chevron-down' : 'chevron-right'));
  button.addEventListener('click', (event) => env.toggle(item, level, event.altKey));
  return button;
}

function eye(id: string, hidden: boolean, env: RowEnv): HTMLButtonElement {
  const label = text(hidden ? 'layers.show' : 'layers.hide');
  const button = iconButton(hidden ? 'eye-off' : 'eye', label);
  button.classList.add('layers-eye');
  button.dataset.eye = id;
  button.setAttribute('aria-pressed', String(hidden));
  button.addEventListener('click', () => env.toggleHidden(id));
  return button;
}

/** The lock toggle: a locked element is picked in Layers only, never on the canvas. */
function padlock(id: string, locked: boolean, env: RowEnv): HTMLButtonElement {
  const label = text(locked ? 'layers.unlock' : 'layers.lock');
  const button = iconButton(locked ? 'lock' : 'unlock', label);
  button.classList.add('layers-lock');
  button.dataset.lock = id;
  button.setAttribute('aria-pressed', String(locked));
  button.addEventListener('click', () => env.toggleLocked(id));
  return button;
}

function nameButton(item: LayerItem, level: number, env: RowEnv): HTMLButtonElement {
  const { node } = item;
  const asSection = level === 1 ? env.sections.get(node.id) : undefined;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = asSection ? 'layers-row layers-section' : 'layers-row';
  button.dataset.layer = node.id;
  if (asSection) {
    button.dataset.section = asSection.id;
    button.title = asSection.purpose;
  } else if (node.name !== '') {
    button.title = node.name;
  }
  const facts = rowFacts(node, env.components.get(node.id), env.changed, env.kindOf(node.id));
  // The kit marker shows on the selected row only, as in the mock.
  if (facts.kit && env.selected.has(node.id)) {
    const marker = icon('component');
    marker.classList.add('layers-kit');
    const wrap = document.createElement('span');
    wrap.className = 'layers-kit-wrap';
    wrap.title = text('layers.kit');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', text('layers.kit'));
    wrap.append(marker);
    button.append(wrap);
  }
  const name = document.createElement('span');
  name.className = 'layers-name k-clip';
  name.textContent = shownName(item, level, env);
  button.append(name);
  if (asSection) {
    const kind = document.createElement('span');
    kind.className = 'layers-kind k-meta';
    kind.textContent = text('layers.sectionKind');
    button.append(kind);
  }
  const shown = badgeOf(facts);
  if (shown !== null) {
    const badge = document.createElement('span');
    badge.className = 'layers-badge k-meta';
    badge.textContent = shown.label;
    badge.title = shown.title;
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', shown.title);
    if (facts.kind !== null) badge.dataset.kind = facts.kind;
    button.append(badge);
  }
  if (facts.changed) {
    const dot = document.createElement('span');
    dot.className = 'layers-dot';
    dot.title = text('layers.changed');
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', text('layers.changed'));
    button.append(dot);
  }
  button.addEventListener('click', (event) => {
    if (env.swallowClick()) return;
    env.select(node.id, addsToSelection(event));
  });
  button.addEventListener('mouseenter', () => env.hover(node.id));
  button.addEventListener('mouseleave', () => env.hover(null));
  button.addEventListener('pointerdown', (event) => {
    env.press(node, asSection ? asSection.id : null, event);
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    // The menu (`structure/menu.ts`) listens for this; the position is in page pixels. It selects
    // the row itself: selecting here first would draw the tree again and take this button off the
    // page before the event could reach the menu, so the first right click did nothing.
    const detail = { id: node.id, x: event.clientX, y: event.clientY };
    document.dispatchEvent(new CustomEvent('edit-menu', { detail }));
  });
  return button;
}

/** The row of `item` and, under it, its children, `level` deep (the roots are level 1). */
export function layerRow(item: LayerItem, level: number, env: RowEnv): HTMLLIElement {
  const { node } = item;
  const li = document.createElement('li');
  li.setAttribute('role', 'treeitem');
  li.setAttribute('aria-level', String(level));
  li.setAttribute('aria-selected', String(env.selected.has(node.id)));
  const parent = item.children.length > 0;
  const open = parent && env.open(node.id, level);
  if (parent) li.setAttribute('aria-expanded', String(open));
  const hidden = env.hidden.has(node.id);
  const locked = env.locked.has(node.id);
  if (hidden) li.dataset.hidden = '';
  if (locked) li.dataset.locked = '';
  const line = document.createElement('div');
  line.className = 'layers-line';
  line.style.setProperty('--layers-depth', String(level - 1));
  line.append(
    twist(item, level, open, env),
    nameButton(item, level, env),
    padlock(node.id, locked, env),
    eye(node.id, hidden, env),
  );
  li.append(line);
  if (open) {
    const group = document.createElement('ul');
    group.setAttribute('role', 'group');
    for (const child of item.children) group.append(layerRow(child, level + 1, env));
    li.append(group);
  }
  return li;
}
