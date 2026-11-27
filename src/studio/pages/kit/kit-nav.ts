// The left side of a kit's page: the kits, and the links to the sections of the page.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';
import { type Entry, kitPicker } from './kit-list.ts';
import type { Anchor } from './kit-token-view.ts';

function link(anchor: Anchor, nested: boolean): Html {
  const cls = nested ? 'kit-link kit-link-sub' : 'kit-link';
  return html`<li><a class="${cls}" href="#${anchor.id}"><span class="k-clip">${anchor.label}</span><span class="k-meta">${anchor.count}</span></a></li>`;
}

/**
 * `sections` are the page's own parts (problems, tokens, components, icons) in their order;
 * `categories` nest under the components link.
 */
export function kitSide(
  t: Translate,
  rows: Entry[],
  current: string,
  sections: Anchor[],
  categories: Anchor[],
): Html {
  const items = sections.map((anchor) => {
    if (anchor.id !== 'kit-components' || categories.length === 0) return link(anchor, false);
    const nested = categories.map((category) => link(category, true));
    return html`${link(anchor, false)}${nested}`;
  });
  return html`<aside class="kit-side">${kitPicker(t, rows, current)}<nav aria-label="${t('studio.kit.onPage')}"><h2 class="kit-side-title">${t('studio.kit.onPage')}</h2><ul class="kit-links" role="list">${items}</ul></nav></aside>`;
}
