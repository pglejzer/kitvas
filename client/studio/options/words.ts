// The words and the small decisions of the options row (plan 25), pure: what the caption above the
// page adds, and which end of the row shows. The row's script (`row.ts`) only draws them.

import {
  type DraftOption,
  type OptionChoice,
  offDefault,
} from '../../../src/shared/values/options.ts';

/** Says a text key with its values (`text` of `../edit/texts.ts`; a plain function in tests). */
export type Say = (key: string, params?: Record<string, string | number>) => string;

/**
 * What the caption above the page adds: the values that differ from the defaults, each as
 * "Columns: 2", in the options' order. Empty at the defaults, so the caption adds nothing.
 */
export function captionWords(
  options: readonly DraftOption[],
  choice: OptionChoice,
  say: Say,
): string {
  const pairs = offDefault(options, choice).flatMap(({ id, value }) => {
    const option = options.find((one) => one.id === id);
    const label = option?.values.find((one) => one.id === value)?.label;
    return option === undefined || label === undefined
      ? []
      : [say('options.captionPair', { option: option.label, value: label })];
  });
  return pairs.join(', ');
}

/** Which of the row's end parts show. */
export type EndParts = { note: boolean; reset: boolean; make: boolean };

/**
 * The row's end: "Default" while every value is the default; else Reset, and Make default too
 * where it can be made (Edit, the latest version).
 */
export function endParts(differs: number, canMake: boolean): EndParts {
  return { note: differs === 0, reset: differs > 0, make: differs > 0 && canMake };
}
