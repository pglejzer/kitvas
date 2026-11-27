// The left side of a kit's page: the search, the kits, and the parts of the kit. One part shows at
// a time. A part's link is a real address (`?view=<id>`), so the page works without the script;
// `client/studio/kit/views.ts` switches the part in place and works the search. The markup
// (`data-kit-search`, `data-view-link`) is the contract with it: change both together.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { type Entry, kitPicker } from './kit-list.ts';
import type { Anchor } from './kit-token-view.ts';

export type SideParts = {
  /** The problems card, which shows above every part; `undefined` for a kit without problems. */
  problems: Anchor | undefined;
  tokens: Anchor[];
  components: Anchor[];
  icons: Anchor[];
  /** The id of the part that shows. */
  shown: string | undefined;
};

const words = (anchor: Anchor): Html =>
  html`<span class="k-clip">${anchor.label}</span><span class="k-meta">${anchor.count}</span>`;

function partLinks(parts: Anchor[], shown: string | undefined): Html {
  const items = parts.map((part) => {
    const here = part.id === shown ? trusted(' aria-current="true"') : '';
    return html`<li><a class="kit-link" href="?view=${part.id}" data-view-link="${part.id}"${here}>${words(part)}</a></li>`;
  });
  return html`<ul class="kit-links" role="list">${items}</ul>`;
}

/** The parts under one title; nothing when the kit has none of them. */
function group(title: string, parts: Anchor[], shown: string | undefined): Html | '' {
  if (parts.length === 0) return '';
  return html`<h2 class="kit-side-title">${title}</h2>${partLinks(parts, shown)}`;
}

function searchField(t: Translate): Html {
  const label = t('studio.kit.search');
  return html`<label class="k-search kit-search">${icon('search')}<input class="k-field" type="search" data-kit-search placeholder="${label}" aria-label="${label}" autocomplete="off" spellcheck="false"></label>`;
}

export function kitSide(t: Translate, rows: Entry[], current: string, parts: SideParts): Html {
  const { problems, shown } = parts;
  const problemsLink =
    problems === undefined
      ? ''
      : html`<ul class="kit-links kit-links-alone" role="list"><li><a class="kit-link" href="#${problems.id}">${words(problems)}</a></li></ul>`;
  // The icons are one part: a link of their own under a line, with no title above it.
  const icons =
    parts.icons.length === 0
      ? ''
      : html`<div class="kit-links-alone">${partLinks(parts.icons, shown)}</div>`;
  return html`<aside class="kit-side">${searchField(t)}${kitPicker(t, rows, current)}<nav class="kit-parts" aria-label="${t('studio.kit.parts')}">${problemsLink}${group(t('studio.kit.tokens'), parts.tokens, shown)}${group(t('studio.kit.components'), parts.components, shown)}${icons}</nav></aside>`;
}
