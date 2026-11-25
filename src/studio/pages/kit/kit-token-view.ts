// The token sections of a kit's page: colours with their contrast, spacing and radius as a drawn
// scale, type as sample lines, and the rest as plain rows. Every token shows as `<code>name</code>`.
// What cannot be a `style=""` attribute (a swatch's colour, a bar's length, a sample's size) is a
// rule of the page's own `<style nonce>` block, made by `views/kit-tokens.ts`.

import type { Translate } from '../../../shared/index.ts';
import type { ColorRow, KitTokens, ValueRow } from '../../views/kit-tokens.ts';
import { type Html, html } from '../html.ts';

/** The sections the page's left side links to, with their counts. */
export type Anchor = { id: string; label: string; count: number };

/** A section as a card: its heading (the id the side links point at) and its count beside it. */
export function cardPart(id: string, title: string, count: number, body: Html): Html {
  return html`<section class="kit-part kit-card" aria-labelledby="${id}"><header class="kit-part-head"><h2 id="${id}">${title}</h2><span class="k-meta">${count}</span></header>${body}</section>`;
}

function colorRow(t: Translate, row: ColorRow): Html {
  const contrast =
    row.contrast === null
      ? ''
      : html`<span class="k-meta">${t('studio.kit.contrast', row.contrast)}</span>`;
  return html`<li class="kit-color"><span class="kit-swatch" data-token="${row.name}"></span><span class="kit-color-text"><code>${row.name}</code><span>${row.value}</span>${contrast}</span></li>`;
}

function colors(t: Translate, rows: ColorRow[]): Html | '' {
  if (rows.length === 0) return '';
  return cardPart(
    'kit-colors',
    t('studio.kit.tokenType.color'),
    rows.length,
    html`<ul class="kit-colors" role="list">${rows.map((row) => colorRow(t, row))}</ul>`,
  );
}

function spacing(t: Translate, rows: ValueRow[]): Html | '' {
  if (rows.length === 0) return '';
  const lines = rows.map(
    (row) =>
      html`<li class="kit-scale-row"><code>${row.name}</code><span class="k-meta">${row.value}</span><span class="kit-bar" data-token="${row.name}"></span></li>`,
  );
  return cardPart(
    'kit-spacing',
    t('studio.kit.section.spacing'),
    rows.length,
    html`<ul class="kit-scale" role="list">${lines}</ul>`,
  );
}

function radius(t: Translate, rows: ValueRow[]): Html | '' {
  if (rows.length === 0) return '';
  const corners = rows.map(
    (row) =>
      html`<li class="kit-corner-item"><span class="kit-corner" data-token="${row.name}"></span><code>${row.name}</code><span class="k-meta">${row.value}</span></li>`,
  );
  return cardPart(
    'kit-radius',
    t('studio.kit.section.radius'),
    rows.length,
    html`<ul class="kit-corners" role="list">${corners}</ul>`,
  );
}

/** Sizes and weights as sample lines in the kit's family; families as rows. */
function typeSection(t: Translate, tokens: KitTokens): Html | '' {
  const { sizes, weights, families } = tokens;
  if (sizes.length + weights.length + families.length === 0) return '';
  const sample = t('studio.kit.sample');
  const line = (row: ValueRow): Html =>
    html`<li class="kit-type-row"><code>${row.name}</code><span class="k-meta">${row.value}</span><span class="kit-sample" data-token="${row.name}">${sample}</span></li>`;
  const family = (row: ValueRow): Html =>
    html`<li class="kit-type-row"><code>${row.name}</code><span class="k-meta kit-type-wide">${row.value}</span></li>`;
  const rows = [...families.map(family), ...sizes.map(line), ...weights.map(line)];
  return cardPart(
    'kit-type',
    t('studio.kit.section.type'),
    rows.length,
    html`<ul class="kit-types" role="list">${rows}</ul>`,
  );
}

function other(t: Translate, rows: ValueRow[]): Html | '' {
  if (rows.length === 0) return '';
  const lines = rows.map(
    (row) => html`<li class="kit-other-row"><code>${row.name}</code><span>${row.value}</span></li>`,
  );
  return cardPart(
    'kit-other',
    t('studio.kit.section.other'),
    rows.length,
    html`<ul class="kit-other" role="list">${lines}</ul>`,
  );
}

export function tokenSections(t: Translate, tokens: KitTokens): Html {
  return html`${colors(t, tokens.colors)}${spacing(t, tokens.spacing)}${radius(t, tokens.radius)}${typeSection(t, tokens)}${other(t, tokens.other)}`;
}

/** The token sections that exist, for the links on the page's left. */
export function tokenAnchors(t: Translate, tokens: KitTokens): Anchor[] {
  const typeCount = tokens.sizes.length + tokens.weights.length + tokens.families.length;
  const all: Anchor[] = [
    { id: 'kit-colors', label: t('studio.kit.tokenType.color'), count: tokens.colors.length },
    { id: 'kit-spacing', label: t('studio.kit.section.spacing'), count: tokens.spacing.length },
    { id: 'kit-radius', label: t('studio.kit.section.radius'), count: tokens.radius.length },
    { id: 'kit-type', label: t('studio.kit.section.type'), count: typeCount },
    { id: 'kit-other', label: t('studio.kit.section.other'), count: tokens.other.length },
  ];
  return all.filter((anchor) => anchor.count > 0);
}
