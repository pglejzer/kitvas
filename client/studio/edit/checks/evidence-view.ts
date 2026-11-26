// The evidence row of a finding of the full check, drawn (plan 18f, task 4; mock v10 `.ev`): a
// sample and the ratio on a bar for a contrast finding, a swatch and the nearest token for an
// off-kit colour, the level chips for a heading order, the measured value for any other. Text with
// `textContent` only; the colours of a sample are values the checks read from the page, set as
// style properties.

import type { TokenOption } from '../../../../src/edit/index.ts';
import { icon } from '../../ui/icon.ts';
import type { Evidence as LiveEvidence } from '../live/evidence.ts';
import { isColourValue, quotedValue } from '../live/row-words.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { BAR_MARK, barFill, type Evidence, evidenceOf } from './evidence.ts';

/** A ratio as the row shows it: at most two decimals, no trailing zeros. */
export const ratioWords = (ratio: number): string => String(Math.round(ratio * 100) / 100);

function swatch(colour: string): HTMLElement {
  const node = el('i', 'k-swatch');
  node.style.setProperty('background', colour);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** The sample: the finding's own text colour on its own background, the way the page paints them. */
function sample(fg: string | null, bg: string | null): HTMLElement {
  const node = el('span', 'checks-ev-sample', text('checks.sample'));
  if (fg !== null) node.style.setProperty('color', fg);
  if (bg !== null) node.style.setProperty('background', bg);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function contrast(row: HTMLElement, evidence: Extract<Evidence, { kind: 'contrast' }>): void {
  const meter = el('span', 'checks-ev-meter');
  const bar = el('span', 'checks-ev-bar');
  bar.setAttribute('role', 'meter');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(ratioWords(evidence.needed)));
  bar.setAttribute('aria-valuenow', String(ratioWords(evidence.ratio)));
  bar.setAttribute('aria-label', text('checks.ratio', { ratio: ratioWords(evidence.ratio) }));
  bar.style.setProperty('--fill', `${Math.round(barFill(evidence.ratio, evidence.needed) * 100)}%`);
  bar.style.setProperty('--mark', `${Math.round(BAR_MARK * 100)}%`);
  bar.append(el('i'), el('em'));
  meter.append(
    el('strong', 'k-fix', text('checks.ratio', { ratio: ratioWords(evidence.ratio) })),
    bar,
    el('small', undefined, text('checks.needs', { needed: ratioWords(evidence.needed) })),
  );
  if (evidence.fg !== null) row.append(sample(evidence.fg, evidence.bg));
  row.append(meter);
}

function colour(row: HTMLElement, evidence: Extract<Evidence, { kind: 'colour' }>): void {
  const change = el('span', 'k-change');
  const old = el('del');
  old.append(swatch(evidence.value), el('span', 'k-mono', evidence.value));
  change.append(old);
  if (evidence.token !== null && evidence.tokenCss !== null) {
    const next = el('ins');
    next.append(swatch(evidence.tokenCss), el('span', undefined, evidence.token));
    change.append(next);
    row.append(change, el('small', undefined, text('checks.nearest')));
    return;
  }
  row.append(change, el('small', undefined, text('checks.noToken')));
}

function levels(row: HTMLElement, evidence: Extract<Evidence, { kind: 'levels' }>): void {
  evidence.levels.forEach((level, index) => {
    if (index > 0) row.append(icon('arrow-right'));
    const chip = el('span', 'checks-ev-level', level);
    if (level === evidence.missing) chip.dataset.missing = '';
    row.append(chip);
  });
  row.append(el('small', undefined, text('checks.missing', { level: evidence.missing })));
}

/** A value in the code font; a colour has its swatch in front. */
export function valueChip(value: string): HTMLElement {
  const chip = el('span', 'checks-ev-value');
  if (isColourValue(value)) chip.append(swatch(value));
  chip.append(el('span', 'k-mono', value));
  return chip;
}

/**
 * The evidence row of a live finding, from what its card measured (the same box, `.checks-ev`):
 * the number in its tone against its limit, or `from → to` of a value on one line. `null` for a
 * finding shown by its words.
 */
export function measuredRow(evidence: LiveEvidence, tone: 'fix' | 'review'): HTMLElement | null {
  if (evidence.kind === 'message') return null;
  const row = el('div', 'checks-ev');
  const strong = (words: string): HTMLElement => el('strong', `k-${tone}`, words);
  const quiet = (words: string): HTMLElement => el('small', undefined, words);
  const to = (): Node[] => [icon('arrow-right'), el('span', 'k-sr', text('changes.chip.to'))];
  switch (evidence.kind) {
    case 'contrast':
      row.append(
        strong(text('checks.ratio', { ratio: ratioWords(evidence.ratio) })),
        quiet(text('checks.needs', { needed: ratioWords(evidence.needed) })),
      );
      break;
    case 'target':
      row.append(
        strong(text('checks.size', { width: evidence.width, height: evidence.height })),
        quiet(text('checks.needsSize', { min: evidence.min })),
      );
      break;
    case 'overflow':
      row.append(
        strong(text('checks.px', { value: evidence.content })),
        quiet(text('checks.inBox', { width: evidence.width })),
      );
      break;
    case 'mismatch': {
      const change = el('span', 'checks-ev-change');
      change.append(valueChip(evidence.expected), ...to(), valueChip(evidence.actual));
      row.append(el('span', 'k-meta', evidence.property), change);
      break;
    }
    case 'token':
      row.append(
        valueChip(evidence.value),
        ...to(),
        valueChip(evidence.token),
        quiet(text('checks.nearest')),
      );
      break;
    case 'heading':
      row.append(strong(text('checks.level', { level: evidence.level })));
      break;
  }
  return row;
}

/**
 * The evidence row of a code finding: a colour written by hand with its nearest kit token, a
 * measure written by hand, or the value its words quote (an import, a tag); `null` when none.
 */
export function codeRow(
  finding: { rule: string; raw: string; element: string | null },
  tokens: readonly TokenOption[],
): HTMLElement | null {
  const facts = { rule: finding.rule, message: finding.raw, hint: '', element: finding.element };
  const found = evidenceOf(facts, tokens);
  if (found.kind !== 'value' || found.text !== null) return evidenceRow(found);
  const quoted = quotedValue(finding.raw);
  if (quoted === null) return null;
  const row = el('div', 'checks-ev');
  row.append(valueChip(quoted));
  return row;
}

/** The row of a finding's evidence; `null` when it measured nothing to show. */
export function evidenceRow(evidence: Evidence): HTMLElement | null {
  if (evidence.kind === 'value' && evidence.text === null) return null;
  const row = el('div', 'checks-ev');
  switch (evidence.kind) {
    case 'contrast':
      contrast(row, evidence);
      break;
    case 'colour':
      colour(row, evidence);
      break;
    case 'levels':
      levels(row, evidence);
      break;
    case 'value':
      row.append(el('code', 'k-mono', evidence.text ?? ''));
      break;
  }
  return row;
}
