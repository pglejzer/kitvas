// The parts of a kit's catalog page: the problems, and the components of each category. A
// component is a card that folds: closed it shows its name and what it is for, open its examples
// and props. It carries its words for the page's search (`data-search`).

import type { KitIssue } from '../../../kit/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { CategoryGroup, ComponentRow, PropRow } from '../../views/kit-view.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { type CatalogInput, catalogNotes, exampleFigure } from './kit-examples.ts';
import { cardPart, type KitPart } from './kit-token-view.ts';

export function problemsSection(t: Translate, issues: KitIssue[]): Html | '' {
  if (issues.length === 0) return '';
  const items = issues.map(
    (issue) => html`<li>${t(issue.key, issue.params)} <code>${issue.path}</code></li>`,
  );
  return cardPart(
    'kit-problems',
    t('studio.kit.problemsTitle'),
    issues.length,
    html`<ul class="kit-list">${items}</ul>`,
  );
}

function propRow(t: Translate, prop: PropRow): Html {
  const required = prop.required ? t('studio.kit.prop.yes') : t('studio.kit.prop.no');
  return html`<tr><th scope="row"><code>${prop.name}</code></th><td>${prop.type}</td><td>${prop.values}</td><td>${prop.default}</td><td>${required}</td></tr>`;
}

function propsTable(t: Translate, component: ComponentRow): Html {
  if (component.props.length === 0) return html`<p class="k-quiet">${t('studio.kit.noProps')}</p>`;
  const head = html`<tr><th scope="col">${t('studio.kit.prop.name')}</th><th scope="col">${t('studio.kit.prop.type')}</th><th scope="col">${t('studio.kit.prop.values')}</th><th scope="col">${t('studio.kit.prop.default')}</th><th scope="col">${t('studio.kit.prop.required')}</th></tr>`;
  const rows = component.props.map((prop) => propRow(t, prop));
  // A scrollable region must take focus, or a keyboard cannot reach the columns that overflow.
  return html`<div class="kit-scroll" role="region" tabindex="0" aria-label="${component.name}"><table class="kit-props"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/** A component as one card that folds: its name and purpose, then the examples beside the props. */
function componentCard(t: Translate, component: ComponentRow, catalog: CatalogInput): Html {
  const deprecated = component.deprecated
    ? html` <span class="k-chip" data-tone="review">${t('studio.kit.deprecated')}</span>`
    : '';
  const examples =
    component.examples.length === 0
      ? ''
      : html`<div class="kit-examples"><h4>${t('studio.kit.examples')}</h4>${component.examples.map(
          (example, index) => exampleFigure(catalog, component.name, index, example),
        )}</div>`;
  const a11y =
    component.a11y.length === 0
      ? ''
      : html`<h4>${t('studio.kit.a11y')}</h4><ul class="kit-list">${component.a11y.map((note) => html`<li>${note}</li>`)}</ul>`;
  const words = `${component.name} ${component.description}`;
  return html`<article class="kit-card kit-fold" data-search="${words}"><details><summary><h3>${component.name}${deprecated}</h3><span class="k-quiet">${component.description}</span>${icon('chevron-down')}</summary><div class="kit-card-body">${examples}<div class="kit-card-facts">${propsTable(t, component)}${a11y}</div></div></details></article>`;
}

/** The id of a category's part. */
export const categoryId = (category: string): string => `kit-cat-${category}`;

/** The components of each category as a part: its heading, the notes of the build, a card each. */
export function componentParts(
  t: Translate,
  groups: CategoryGroup[],
  catalog: CatalogInput,
): KitPart[] {
  return groups.map((group) => {
    const id = categoryId(group.category);
    const label = t(`studio.kit.category.${group.category}`);
    const count = group.components.length;
    const title = t('studio.kit.categoryTitle', { category: label });
    const cards = group.components.map((component) => componentCard(t, component, catalog));
    const body = html`<section class="kit-part" aria-labelledby="${id}"><header class="kit-part-head"><h2 id="${id}">${title}</h2><span class="k-meta" data-view-count>${count}</span></header>${catalogNotes(catalog)}${cards}</section>`;
    return { id, label, count, body };
  });
}
