// The token parts of a kit's page: colours with their contrast, spacing and radius as a drawn
// scale, type as sample lines, and the rest as plain rows. Every token shows as `<code>name</code>`
// and carries its words for the page's search (`data-search`).
// What cannot be a `style=""` attribute (a swatch's colour, a bar's length, a sample's size) is a
// rule of the page's own `<style nonce>` block, made by `views/kit-tokens.ts`.

import type { Translate } from '../../../shared/index.ts';
import type { ColorRow, KitTokens, ValueRow } from '../../views/kit-tokens.ts';
import { addedMark } from '../added-mark.ts';
import { type Html, html } from '../html.ts';

/** A link on the page's left: what it leads to, its words and its count. */
export type Anchor = { id: string; label: string; count: number };

/** A part of the page that shows alone: its link on the left and what it shows. */
export type KitPart = Anchor & { body: Html };

/** A section as a card: its heading (the id it is named by) and its count beside it. */
export function cardPart(id: string, title: string, count: number, body: Html): Html {
  return html`<section class="kit-part kit-card" aria-labelledby="${id}"><header class="kit-part-head"><h2 id="${id}">${title}</h2><span class="k-meta" data-view-count>${count}</span></header>${body}</section>`;
}

/** A part whose body is one card with the part's own words as its heading. */
export function cardOf(id: string, label: string, count: number, body: Html): KitPart {
  return { id, label, count, body: cardPart(id, label, count, body) };
}

/** What the search finds a token by: its name and its value. */
const words = (row: ValueRow): string => `${row.name} ${row.value}`;

function colorRow(t: Translate, row: ColorRow): Html {
  const contrast =
    row.contrast === null
      ? ''
      : html`<span class="k-meta">${t('studio.kit.contrast', row.contrast)}</span>`;
  return html`<li class="kit-color" data-search="${words(row)}"><span class="kit-swatch" data-token="${row.name}"></span><span class="kit-color-text"><code>${row.name}</code><span>${row.value}</span>${contrast}</span></li>`;
}

function colors(t: Translate, rows: ColorRow[]): KitPart[] {
  if (rows.length === 0) return [];
  const list = html`<ul class="kit-colors" role="list">${rows.map((row) => colorRow(t, row))}</ul>`;
  return [cardOf('kit-colors', t('studio.kit.tokenType.color'), rows.length, list)];
}

function spacing(t: Translate, rows: ValueRow[]): KitPart[] {
  if (rows.length === 0) return [];
  const lines = rows.map(
    (row) =>
      html`<li class="kit-scale-row" data-search="${words(row)}"><code>${row.name}</code><span class="k-meta">${row.value}</span><span class="kit-bar" data-token="${row.name}"></span></li>`,
  );
  const list = html`<ul class="kit-scale" role="list">${lines}</ul>`;
  return [cardOf('kit-spacing', t('studio.kit.section.spacing'), rows.length, list)];
}

function radius(t: Translate, rows: ValueRow[]): KitPart[] {
  if (rows.length === 0) return [];
  const corners = rows.map(
    (row) =>
      html`<li class="kit-corner-item" data-search="${words(row)}"><span class="kit-corner" data-token="${row.name}"></span><code>${row.name}</code><span class="k-meta">${row.value}</span></li>`,
  );
  const list = html`<ul class="kit-corners" role="list">${corners}</ul>`;
  return [cardOf('kit-radius', t('studio.kit.section.radius'), rows.length, list)];
}

/** Sizes and weights as sample lines in the kit's family; families as rows. */
function typeSection(t: Translate, tokens: KitTokens): KitPart[] {
  const { sizes, weights, families } = tokens;
  if (sizes.length + weights.length + families.length === 0) return [];
  const sample = t('studio.kit.sample');
  const line = (row: ValueRow): Html =>
    html`<li class="kit-type-row" data-search="${words(row)}"><code>${row.name}</code><span class="k-meta">${row.value}</span><span class="kit-sample" data-token="${row.name}">${sample}</span></li>`;
  const family = (row: ValueRow): Html =>
    html`<li class="kit-type-row" data-search="${words(row)}"><code>${row.name}</code><span class="k-meta kit-type-wide">${row.value}</span></li>`;
  const rows = [...families.map(family), ...sizes.map(line), ...weights.map(line)];
  const list = html`<ul class="kit-types" role="list">${rows}</ul>`;
  return [cardOf('kit-type', t('studio.kit.section.type'), rows.length, list)];
}

const plainRow = (row: ValueRow): Html =>
  html`<li class="kit-other-row" data-search="${words(row)}"><code>${row.name}</code><span>${row.value}</span></li>`;

function other(t: Translate, rows: ValueRow[]): KitPart[] {
  if (rows.length === 0) return [];
  const list = html`<ul class="kit-other" role="list">${rows.map(plainRow)}</ul>`;
  return [cardOf('kit-other', t('studio.kit.section.other'), rows.length, list)];
}

/** The tokens a project added to the kit: their own card, its note the mark's text (`added-mark.ts`). */
export type AddedTokens = { rows: ValueRow[]; note: string };

function addedSection(t: Translate, added: AddedTokens | undefined): KitPart[] {
  if (added === undefined || added.rows.length === 0) return [];
  const note = html`<p class="k-meta kit-added-note">${addedMark(added.note)}<span>${added.note}</span></p>`;
  const list = html`${note}<ul class="kit-other" role="list">${added.rows.map(plainRow)}</ul>`;
  return [cardOf('kit-added', t('studio.kit.section.added'), added.rows.length, list)];
}

/** The token parts the kit has, in the page's order. */
export function tokenParts(t: Translate, tokens: KitTokens, added?: AddedTokens): KitPart[] {
  return [
    ...colors(t, tokens.colors),
    ...spacing(t, tokens.spacing),
    ...radius(t, tokens.radius),
    ...typeSection(t, tokens),
    ...other(t, tokens.other),
    ...addedSection(t, added),
  ];
}
