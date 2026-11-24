// Findings before a write (spec 4c, goal 5; plan 16, task C): whether a picker option would fail a
// live check for the selected element, so the option shows a warning sign before it is chosen.
// The rows (task B) call it with the option's resolved value and the element's accessibility card
// (`store.a11y`), which carries the element's text colour, what is behind it, and its target.

import type { A11yCard } from '../../../channel/live-protocol.ts';
import { MIN_TARGET, neededRatio, over, parseColour, textContrast } from './colour.ts';

export type PickerWarning = 'contrast' | 'target';

/** The properties that set a target's size. */
const SIZES = new Set(['width', 'height']);
const PX = /^(-?\d*\.?\d+)px$/;

/** A length in CSS pixels; `null` for any other value. */
function pxOf(value: string): number | null {
  const match = PX.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/**
 * `value`: the option as a CSS value the browser resolved (`rgb(…)`, `12px`); `null` when the row
 * cannot resolve it, and then there is no warning. A text colour is held against what is behind
 * the text; a background against the text on it, the new background over what shows through it
 * now. A width or height below 24 px warns for an interactive element only.
 */
export function pickerWarning(input: {
  property: string;
  value: string | null;
  card: A11yCard | null;
}): PickerWarning | null {
  const { property, value, card } = input;
  if (value === null || card === null) return null;
  if (property === 'color' || property === 'background-color') {
    // An element without text of its own has no contrast to keep.
    if (card.contrast === null) return null;
    const candidate = parseColour(value);
    if (candidate === null) return null;
    const behind = card.background === null ? null : parseColour(card.background);
    const now = card.color === null ? null : parseColour(card.color);
    const forText = property === 'color';
    const text = forText ? candidate : now;
    let background = behind;
    if (!forText) background = behind === null ? candidate : over(candidate, behind);
    if (text === null || background === null) return null;
    return textContrast(text, background) < neededRatio(card.contrast.large) ? 'contrast' : null;
  }
  if (SIZES.has(property) && card.target !== null) {
    const px = pxOf(value);
    return px !== null && px + 0.01 < MIN_TARGET ? 'target' : null;
  }
  return null;
}
