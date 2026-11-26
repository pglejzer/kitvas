// The kit's colour token nearest to a colour (plan 18f, task 4). Pure: a token is a candidate when
// it is an opaque colour, and the distance is the one the Properties pane and the Kit lens use
// (`nearestToken`, OKLab), so a card and the "Custom…" editor name the same token for one value.

import type { TokenOption } from '../../../../src/edit/index.ts';
import { parseColour, type Rgba } from '../../../../src/shared/values/colour.ts';
import { nearestToken } from '../props/values/kit-value.ts';

/** The kit's colour tokens that are opaque, each with its colour read. */
export function colourTokens(tokens: readonly TokenOption[]): { token: TokenOption; rgba: Rgba }[] {
  return tokens.flatMap((token) => {
    const rgba = token.type === 'color' ? parseColour(token.css) : null;
    return rgba !== null && rgba.a >= 1 ? [{ token, rgba }] : [];
  });
}

/**
 * The colour token nearest to `value` (a hex or `rgb()` written in the source); the first of equals.
 * `null` when the value is not a colour kitvas reads (a name, a function) or the kit has no colour.
 */
export function nearestColourToken(
  value: string,
  tokens: readonly TokenOption[],
): TokenOption | null {
  return nearestToken(
    value,
    colourTokens(tokens).map(({ token }) => token),
  );
}

/** The name a card gives a colour token: its path without the group (`color.inkMid` is `inkMid`). */
export const tokenLabel = (token: TokenOption): string => token.path.replace(/^colou?rs?\./, '');
