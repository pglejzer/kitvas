// The layers tree with readable names and search (plan 13, task F). Built with
// `createElement` and `textContent` only: names come from the page being edited.

import type { TreeNode } from '../../channel/edit-protocol.ts';
import type { EditorContext } from './context.ts';
import { filterTree, nextSelection } from './selection.ts';
import { text } from './texts.ts';

export type LayerItem = { node: TreeNode; children: LayerItem[] };

/** The "× n" badge shows for an item of a mapped list only; the count, or `null`. */
export function badgeCount(node: TreeNode): number | null {
  return node.count > 1 ? node.count : null;
}

/** Nests a flat tree in document order; a node whose parent is not in the list is a root. */
export function nestTree(nodes: TreeNode[]): LayerItem[] {
  const items = new Map<string, LayerItem>();
  for (const node of nodes) items.set(node.id, { node, children: [] });
  const roots: LayerItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id);
    if (!item) continue;
    const parent = node.parent === null ? undefined : items.get(node.parent);
    (parent ? parent.children : roots).push(item);
  }
  return roots;
}

export function mountLayers(ctx: EditorContext): void {
  const { store, bridge, panel } = ctx;
  const section = panel.querySelector('section[data-edit="layers"]');
  if (!(section instanceof HTMLElement)) return;

  let query = '';

  const heading = document.createElement('h2');
  heading.textContent = text('layers.title');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'layers-search';
  search.placeholder = text('layers.search');
  search.setAttribute('aria-label', text('layers.search'));
  const list = document.createElement('ul');
  list.className = 'layers-tree';
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', text('layers.title'));
  section.append(heading, search, list);

  function row(item: LayerItem, level: number, selected: Set<string>): HTMLLIElement {
    const { node } = item;
    const li = document.createElement('li');
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-level', String(level));
    li.setAttribute('aria-selected', String(selected.has(node.id)));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'layers-row';
    button.dataset.layer = node.id;
    const name = document.createElement('span');
    name.className = 'layers-name';
    name.textContent = node.name;
    button.append(name);
    const count = badgeCount(node);
    if (count !== null) {
      const badge = document.createElement('span');
      badge.className = 'layers-badge';
      badge.textContent = text('layers.count', { count });
      button.append(badge);
    }
    button.addEventListener('click', (event) => {
      const state = store.get();
      const selection = nextSelection(state.selection, { id: node.id, add: event.shiftKey });
      store.set({ selection });
    });
    button.addEventListener('mouseenter', () => bridge.send({ type: 'hover', id: node.id }));
    button.addEventListener('mouseleave', () => bridge.send({ type: 'hover', id: null }));
    li.append(button);
    if (item.children.length > 0) {
      const group = document.createElement('ul');
      group.setAttribute('role', 'group');
      for (const child of item.children) group.append(row(child, level + 1, selected));
      li.append(group);
    }
    return li;
  }

  function render(): void {
    const state = store.get();
    const nodes = filterTree(state.tree, query);
    const selected = new Set(state.selection);
    // Rebuilding the list must not drop the keyboard focus from the row the person used.
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && list.contains(active) ? active.dataset.layer : null;
    list.replaceChildren();
    if (nodes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'layers-empty';
      empty.textContent = text(state.tree.length === 0 ? 'layers.none' : 'layers.nomatch');
      list.append(empty);
      return;
    }
    for (const item of nestTree(nodes)) list.append(row(item, 1, selected));
    markHover(state.hovered);
    if (focused) {
      for (const button of list.querySelectorAll<HTMLElement>('.layers-row')) {
        if (button.dataset.layer === focused) button.focus();
      }
    }
  }

  function markHover(id: string | null): void {
    for (const button of list.querySelectorAll<HTMLElement>('.layers-row')) {
      button.toggleAttribute('data-hover', button.dataset.layer === id);
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    render();
  });

  store.subscribe((state, previous) => {
    if (state.tree !== previous.tree || state.selection !== previous.selection) render();
    else if (state.hovered !== previous.hovered) markHover(state.hovered);
  });
  render();
}
