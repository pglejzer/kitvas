// The accessibility card in the Properties pane (spec 4c, goal 7; plan 16, task C): the frame's
// `A11yCard` of the selected element as rows, each problem named, and a problem the live checks
// also found links to that finding. `cardRows` is pure; `renderCard` builds the markup with
// `textContent` only.

import { enhancedRatio, MIN_TARGET, neededRatio } from '../../../../src/shared/values/colour.ts';
import type { A11yCard } from '../../../channel/live-protocol.ts';
import { text } from '../texts.ts';
import { LIVE_RULE_IDS } from './items.ts';

/** Roles a person must be able to tell apart by name: without one, the card says so. */
const NEEDS_NAME = new Set([
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'img',
  'link',
  'menuitem',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
]);
/** Roles a keyboard must reach. */
const OPERABLE = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
]);

export type CardRow = {
  key: 'role' | 'name' | 'focus' | 'contrast' | 'target' | 'alt' | 'heading';
  label: string;
  value: string;
  problem: boolean;
  /** The live rule the problem is, so the row can link to that finding; `null` for none. */
  rule: string | null;
};

const verdict = (pass: boolean): string => text(pass ? 'a11y.pass' : 'a11y.fail');

function nameRow(card: A11yCard): CardRow {
  const named = card.name !== '';
  const from = text(`a11y.from.${card.nameFrom}`);
  return {
    key: 'name',
    label: text('a11y.name'),
    value: named ? text('a11y.nameValue', { name: card.name, from }) : text('a11y.noName'),
    problem: !named && NEEDS_NAME.has(card.role),
    rule: null,
  };
}

function focusRow(card: A11yCard): CardRow {
  let value = text('a11y.notFocusable');
  if (card.focusable) {
    value =
      card.tabIndex === null ? text('a11y.focusable') : text('a11y.tabAt', { n: card.tabIndex });
  }
  return {
    key: 'focus',
    label: text('a11y.focus'),
    value,
    problem: !card.focusable && OPERABLE.has(card.role),
    rule: null,
  };
}

function altRow(card: A11yCard): CardRow | null {
  if (card.alt === null && card.role !== 'img') return null;
  let value = card.alt ?? text('a11y.noAlt');
  if (card.alt === '') value = text('a11y.decorative');
  return {
    key: 'alt',
    label: text('a11y.alt'),
    value,
    problem: card.alt === null,
    rule: null,
  };
}

/** The card's rows, in reading order; rows that do not apply to the element are left out. */
export function cardRows(card: A11yCard): CardRow[] {
  const rows: CardRow[] = [
    { key: 'role', label: text('a11y.role'), value: card.role, problem: false, rule: null },
    nameRow(card),
    focusRow(card),
  ];
  if (card.contrast !== null) {
    const { ratio, large } = card.contrast;
    const aa = ratio >= neededRatio(large);
    const aaa = ratio >= enhancedRatio(large);
    rows.push({
      key: 'contrast',
      label: text('a11y.contrast'),
      value: text('a11y.contrastValue', { ratio, aa: verdict(aa), aaa: verdict(aaa) }),
      problem: !aa,
      rule: LIVE_RULE_IDS.contrast,
    });
  }
  if (card.target !== null) {
    const { width, height } = card.target;
    rows.push({
      key: 'target',
      label: text('a11y.target'),
      value: text('a11y.targetValue', { width, height }),
      problem: width + 0.01 < MIN_TARGET || height + 0.01 < MIN_TARGET,
      rule: LIVE_RULE_IDS['target-size'],
    });
  }
  const alt = altRow(card);
  if (alt) rows.push(alt);
  if (card.heading !== null) {
    rows.push({
      key: 'heading',
      label: text('a11y.heading'),
      value: text('a11y.level', { level: card.heading }),
      problem: false,
      rule: null,
    });
  }
  return rows;
}

export const problemCount = (rows: readonly CardRow[]): number =>
  rows.filter((row) => row.problem).length;
