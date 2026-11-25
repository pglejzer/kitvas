// Small pieces of the Insert pane's panels: a list of tiles and a category heading. Drawing only.

/** A list; `className` picks the grid (`insert-tiles`, `insert-rows`, `insert-glyphs`). */
export function listOf(className: string, items: readonly HTMLElement[]): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = className;
  list.append(...items);
  return list;
}

/** The plain heading of a category of components; `title` goes in with `textContent`. */
export function categoryHead(title: string): HTMLHeadingElement {
  const heading = document.createElement('h3');
  heading.className = 'insert-cat';
  heading.textContent = title;
  return heading;
}
