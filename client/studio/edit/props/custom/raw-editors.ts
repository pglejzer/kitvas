// The editors a "Custom" row opens (moved out of `controls.ts` in plan 19, task T5; spec goal 14):
// a colour gets the colour panel, a length a number with its units, a weight or a line height a
// number. Each hands back the value as a style value: a typed one is a raw value, marked off kit
// in Changes (`auto` is the size scale's own keyword and carries no mark); "Use <token>" writes
// the kit's token instead. The checks of a typed value are `number-rules.ts` and `colour-math.ts`.

import type { StyleProperty, StyleValue, TokenOption } from '../../../../../src/edit/index.ts';
import { nearestToken } from '../values/kit-value.ts';
import { allowsNegative } from '../values/units.ts';
import { colourPicker } from './colour-picker.ts';
import { type Editor, numberField } from './number-field.ts';
import { AUTO, NONE, type NumberRule, WEIGHT_RULE } from './number-rules.ts';

export type { Editor } from './number-field.ts';

export type EditorKind =
  | { kind: 'colour'; warn?(css: string): string | null }
  | { kind: 'length'; property: StyleProperty; units: readonly string[] }
  | { kind: 'weight' }
  | { kind: 'number' };

/** A line height: a plain number, or a length. */
const NUMBER_RULE: NumberRule = { min: 0, max: null, step: 0.1, units: [NONE, 'px', 'rem'] };

/** The style value a typed CSS text writes. */
export const valueOfCss = (css: string): StyleValue =>
  css === AUTO ? { raw: AUTO, mark: false } : { raw: css };

export function customEditor(options: {
  label: string;
  kind: EditorKind;
  tokens: readonly TokenOption[];
  /** The raw value the source holds, else `null`. */
  raw: string | null;
  /** Where the editor starts when the source holds no raw value: the token's or the frame's value. */
  start: string | null;
  onPreview(value: StyleValue | null): void;
  onPick(value: StyleValue): void;
  /** Escape in the editor: the old value is back, and the row closes the editor. */
  onCancel(): void;
}): Editor {
  const { kind, tokens } = options;
  const onPreview = (css: string | null): void =>
    options.onPreview(css === null ? null : valueOfCss(css));
  const onPick = (css: string): void => options.onPick(valueOfCss(css));
  const onUse = (token: TokenOption): void => options.onPick({ token: token.var });
  if (kind.kind === 'colour') {
    return colourPicker({
      label: options.label,
      value: options.raw ?? options.start,
      held: options.raw,
      tokens,
      ...(kind.warn ? { warn: kind.warn } : {}),
      onPreview,
      onPick,
      onUse,
      onCancel: options.onCancel,
    });
  }
  let rule: NumberRule;
  let from = 0;
  if (kind.kind === 'length') {
    rule = {
      min: allowsNegative(kind.property) ? null : 0,
      max: null,
      step: 1,
      units: kind.units,
    };
  } else if (kind.kind === 'weight') {
    rule = WEIGHT_RULE;
    from = 400;
  } else {
    rule = NUMBER_RULE;
    from = 1;
  }
  return numberField({
    ...rule,
    label: options.label,
    value: options.raw ?? options.start,
    start: from,
    nearest: (css) => nearestToken(css, tokens),
    onPreview,
    onPick,
    onUse,
    onCancel: options.onCancel,
  });
}
