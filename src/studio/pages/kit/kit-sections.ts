// The parts of a kit's catalog page: problems and components.

import type { KitIssue } from '../../../kit/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { CategoryGroup, ComponentRow, PropRow } from '../../views/kit-view.ts';
import { type Html, html } from '../html.ts';
import { type CatalogInput, catalogNotes, exampleFigure } from './kit-examples.ts';
import { cardPart } from './kit-token-view.ts';

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

/** A component as one card: its name, the framed examples beside the props, and the notes. */
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
  return html`<article class="kit-card"><h3>${component.name}${deprecated}</h3><p class="k-quiet">${component.description}</p><div class="kit-card-body">${examples}<div class="kit-card-facts">${propsTable(t, component)}${a11y}</div></div></article>`;
}

/** The anchor of a category's heading. */
export const categoryId = (category: string): string => `kit-cat-${category}`;

export function componentsSection(
  t: Translate,
  groups: CategoryGroup[],
  catalog: CatalogInput,
): Html | '' {
  if (groups.length === 0) return '';
  const blocks = groups.map(
    (group) =>
      html`<p class="kit-category" id="${categoryId(group.category)}">${t(`studio.kit.category.${group.category}`)}</p>${group.components.map((component) => componentCard(t, component, catalog))}`,
  );
  return html`<section class="kit-part" aria-labelledby="kit-components"><h2 id="kit-components">${t('studio.kit.components')}</h2>${catalogNotes(catalog)}${blocks}</section>`;
}
