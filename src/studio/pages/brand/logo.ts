// The kitvas logo as an inline SVG (spec 6.2, ADR 0068): the mark (a block and a pointer) and the
// word, in one colour, `currentColor`. The paths are those of `docs/brand/kitvas-logo.svg`; a test
// fails when they differ. Each part carries a class, so the motion can address it
// (`skin/logo.ts`): the block, the pointer (the "v" of the word, placed by a transform) and the six
// letters. A letter's place is the `transform` of its inner path, so a rule that moves the letter's
// group never takes the place away.

import { THEME_COLORS } from '../../theme/tokens.ts';
import { type Html, html, trusted } from '../html.ts';

export type LogoKind = 'full' | 'mark';
export type LogoOptions = {
  /** The accessible name (`role="img"`, `aria-label`); left out, the logo is decoration (`aria-hidden="true"`). */
  label?: string;
  /** Class names beside `k-logo`, for the size its place gives it. */
  className?: string;
  /** `data-play`: this logo plays the entrance when the page starts one (`logoEntrance`). */
  play?: boolean;
  /** `data-claude`: its pointer shows that Claude works. The bars' logos only. */
  working?: boolean;
};

const BLOCK = 'M0 0H44V33.46L27.2 27.2L33.46 44H0Z';
/** The "v": a letter of the word, and the pointer of the mark. */
const V = 'M0 0H9L16 15.3L23 0H32L16 35Z';
/** The pointer's place on the block; `skin/logo.ts` says the same as a rule, where its motion ends. */
const POINTER_PLACE = 'translate(34 34) rotate(135) scale(0.83) translate(-16 -35)';
/** The word's place beside the mark. */
const WORD_PLACE = 'translate(76 1)';

/** The six letters, each with its place in the word (`null`: at the word's start). */
const LETTERS: readonly { d: string; place: string | null }[] = [
  { d: 'M0 8H8V31L19 20H30L13 37L30 54H19L8 43V54H0Z', place: null },
  { d: 'M0 8H8V16H0ZM0 20H8V54H0Z', place: 'translate(35 0)' },
  { d: 'M6 8H14V20H20V28H14V54H6V28H0V20H6Z', place: 'translate(47 0)' },
  { d: V, place: 'translate(70 20)' },
  {
    d: 'M28 20H36V54H28V51.97A18 18 0 1 1 28 22.03ZM28 37A10 10 0 1 0 8 37A10 10 0 1 0 28 37Z',
    place: 'translate(101 0)',
  },
  {
    d: 'M27 19H11A11 11 0 0 0 11 41H17A3 3 0 0 1 17 47H1V55H17A11 11 0 0 0 17 33H11A3 3 0 0 1 11 27H27Z',
    place: 'translate(141 0)',
  },
];

const MARK = `<path class="k-logo-block" d="${BLOCK}"/><path class="k-logo-pointer" transform="${POINTER_PLACE}" d="${V}"/>`;

const WORD = `<g transform="${WORD_PLACE}">${LETTERS.map(
  ({ d, place }) =>
    `<g class="k-logo-letter"><path fill-rule="evenodd"${place === null ? '' : ` transform="${place}"`} d="${d}"/></g>`,
).join('')}</g>`;

/**
 * The browser tab's icon, as a data address: the mark in the studio's ink, dark on a light tab bar
 * and light on a dark one. The pages' policy lets `img-src` take `data:`.
 */
export const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>path{fill:${THEME_COLORS.light.ink}}@media (prefers-color-scheme:dark){path{fill:${THEME_COLORS.dark.ink}}}</style><path d="${BLOCK}"/><path transform="${POINTER_PLACE}" d="${V}"/></svg>`,
)}`;

/** `full`: the mark and the word, viewBox `0 0 245 64`. `mark`: the mark alone, `0 0 64 64`. */
export function logo(kind: LogoKind, options: LogoOptions = {}): Html {
  const { label, className, play, working } = options;
  const classes = className === undefined || className === '' ? 'k-logo' : `k-logo ${className}`;
  // An empty name says nothing: the logo is then decoration, as without one.
  const name =
    label === undefined || label === ''
      ? trusted(' aria-hidden="true"')
      : html` role="img" aria-label="${label}"`;
  const marks = trusted(
    `${play === true ? ' data-play' : ''}${working === true ? ' data-claude' : ''}`,
  );
  const viewBox = kind === 'full' ? '0 0 245 64' : '0 0 64 64';
  const parts = trusted(kind === 'full' ? `${MARK}${WORD}` : MARK);
  return html`<svg class="${classes}" viewBox="${viewBox}"${name}${marks}>${parts}</svg>`;
}

/** The session-storage key that says this tab has seen the entrance. */
export const LOGO_SEEN_KEY = 'kitvas-logo';

/**
 * The inline script that starts the entrance once for a tab. Put it in the markup before the logo
 * that plays: it sets `data-logo-enter` on `<html>` before the logo is painted, so the logo is never
 * shown still and then hidden. The mark is written first; a storage that throws means no entrance.
 */
export function logoEntrance(nonce: string): Html {
  const code = `(function(){try{var s=sessionStorage;if(s.getItem('${LOGO_SEEN_KEY}'))return;s.setItem('${LOGO_SEEN_KEY}','1');document.documentElement.setAttribute('data-logo-enter','')}catch(e){}})()`;
  return html`<script nonce="${nonce}">${trusted(code)}</script>`;
}
