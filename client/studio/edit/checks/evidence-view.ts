// The evidence row of a finding of the full check, drawn (plan 18f, task 4; mock v10 `.ev`): a
// sample and the ratio on a bar for a contrast finding, a swatch and the nearest token for an
// off-kit colour, the level chips for a heading order, the measured value for any other. Text with
// `textContent` only; the colours of a sample are values the checks read from the page, set as
// style properties.

import { icon } from '../../ui/icon.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { BAR_MARK, barFill, type Evidence } from './evidence.ts';

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
