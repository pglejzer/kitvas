// The option values a finding of the full check was seen with (plan 25, C7). The server writes them
// on the card as `data-options="columns=2 theme=dark"` (ids and values are lower-case letters,
// digits and dashes, so a space and an equals sign are safe). A card shows them as a chip, "Columns:
// 2", with the words of the caption above the page, and "Show on canvas" first shows them.

import type { DraftOption, OptionChoice } from '../../../../src/shared/values/options.ts';
import { captionWords, type Say } from '../../options/words.ts';

export type FindingOptions = readonly { id: string; value: string }[];

/** The pairs of a card's `data-options`; none for a card of the default combination. */
export function parseFindingOptions(attribute: string | undefined): FindingOptions {
  if (attribute === undefined) return [];
  return attribute.split(' ').flatMap((pair): FindingOptions => {
    const [id, value] = pair.split('=');
    return id === undefined || value === undefined || id === '' || value === ''
      ? []
      : [{ id, value }];
  });
}

/** The choice these values make laid over the one shown: only what the finding names. */
export const choiceOf = (found: FindingOptions): OptionChoice =>
  Object.fromEntries(found.map(({ id, value }) => [id, value]));

/**
 * "Columns: 2" for the values of the finding, in the options' order; empty for a finding of the
 * default combination and for values the version no longer has (the options file changed since).
 */
export function chipWords(
  options: readonly DraftOption[],
  found: FindingOptions,
  say: Say,
): string {
  return captionWords(options, choiceOf(found), say);
}
