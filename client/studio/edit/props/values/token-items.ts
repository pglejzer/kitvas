// The kit's tokens as items of the studio select (plan 18e, task 3): the name is the last part of
// the token's path, the group the path before it, the detail the value as CSS writes it. Pure, so
// a test runs it on plain data.

import type { TokenOption } from '../../../../../src/edit/index.ts';
import type { SelectItem } from '../../../ui/select/model.ts';

export function tokenItems(
  tokens: readonly TokenOption[],
  options: { colour: boolean; warn?: (token: TokenOption) => string | null },
): SelectItem[] {
  return tokens.map((token) => {
    const cut = token.path.lastIndexOf('.');
    return {
      value: token.var,
      name: cut < 0 ? token.path : token.path.slice(cut + 1),
      group: cut < 0 ? null : token.path.slice(0, cut),
      detail: token.css,
      // Only a colour has a sample; a length or a weight would make an empty box.
      swatch: options.colour ? token.css : null,
      warn: options.warn?.(token) ?? null,
    };
  });
}
