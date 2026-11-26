// The kitvas logo as an inline SVG (spec 6.2, ADRs 0068 and 0084): the icon (two kit parts joined by
// a dovetail), the word and two loose parts (the dot of the "i" and a full stop). The icon and the
// parts take the accent, the word the text's colour, both as rules of `skin/logo.ts`: the markup
// has no colour. The paths are those of `docs/brand/kitvas-logo.svg`; a test fails when they differ.
// The icon is a group of two paths; the right one (`k-logo-joint`) is the part the working sign
// nudges along the joint. Each part carries a class, so the motion can address it. A CSS `transform` replaces the
// `transform` attribute, so a part a rule moves never carries its place: the place is on the group
// around it (the loose parts, the icon) or on a letter's inner path (the letter's group moves).

import { ACCENT_COLORS } from '../../theme/tokens.ts';
import { type Html, html, trusted } from '../html.ts';
import { PART_D } from './part.ts';

export type LogoKind = 'full' | 'mark';
export type LogoOptions = {
  /** The accessible name (`role="img"`, `aria-label`); left out, the logo is decoration (`aria-hidden="true"`). */
  label?: string;
  /** Class names beside `k-logo`, for the size its place gives it. */
  className?: string;
  /** `data-play`: this logo plays the entrance when the page starts one (`logoEntrance`). */
  play?: boolean;
  /** `data-claude`: its joint (and the full stop) show that Claude works. The bars' logos only. */
  working?: boolean;
};

/** The icon's two parts: the left one holds the tail, the right one (the joint) the socket. */
const ICON_LEFT = 'M3 0H12V13L22 10V24L12 21V34H3A3 3 0 0 1 0 31V3A3 3 0 0 1 3 0Z';
const ICON_RIGHT = 'M16 0H31A3 3 0 0 1 34 3V31A3 3 0 0 1 31 34H16V26.4L26 29.4V4.6L16 7.6Z';
/** The icon's place beside the word, and the word's place. */
const ICON_PLACE = 'translate(2 6)';
const WORD_PLACE = 'translate(47 0)';

/** The six letters, each with its place in the word (`null`: at the word's start). */
const LETTERS: readonly { d: string; place: string | null }[] = [
  {
    d: 'M0 9A3 3 0 0 1 6 9V37A3 3 0 0 1 0 37ZM.88 28.88L10.88 18.88A3 3 0 0 1 15.12 23.12L5.12 33.12ZM9.62 24.88L19.62 34.88A3 3 0 0 1 15.38 39.12L5.38 29.12Z',
    place: null,
  },
  { d: 'M24 21A3 3 0 0 1 30 21V37A3 3 0 0 1 24 37Z', place: 'translate(1 0)' },
  {
    d: 'M35.5 12A3 3 0 0 1 41.5 12V37A3 3 0 0 1 35.5 37ZM35.5 18H42.5A3 3 0 0 1 42.5 24H35.5A3 3 0 0 1 35.5 18Z',
    place: 'translate(2.5 0)',
  },
  {
    d: 'M53.25 19.8L60.25 35.8A3 3 0 0 1 54.75 38.2L47.75 22.2A3 3 0 0 1 53.25 19.8ZM61.75 19.8A3 3 0 0 1 67.25 22.2L60.25 38.2A3 3 0 0 1 54.75 35.8Z',
    place: 'translate(4 0)',
  },
  {
    d: 'M69 29A11 11 0 1 1 91 29A11 11 0 1 1 69 29ZM75 29A5 5 0 1 0 85 29A5 5 0 1 0 75 29ZM85 21A3 3 0 0 1 91 21V37A3 3 0 0 1 85 37Z',
    place: 'translate(6 0)',
  },
  {
    d: 'M101.88 18H109.25A2.5 2.5 0 0 1 109.25 23H101.88A1.75 1.75 0 0 0 101.88 26.5H105.12A6.75 6.75 0 0 1 105.12 40H97.75A2.5 2.5 0 0 1 97.75 35H105.12A1.75 1.75 0 0 0 105.12 31.5H101.88A6.75 6.75 0 0 1 101.88 18Z',
    place: 'translate(6.5 0)',
  },
];

const ICON_PATH = `<g class="k-logo-icon"><path d="${ICON_LEFT}"/><path class="k-logo-joint" d="${ICON_RIGHT}"/></g>`;
const FULL_ICON = `<g transform="${ICON_PLACE}">${ICON_PATH}</g>`;

/** A loose part at its place in the word: the dot of the "i", or the full stop. */
const dot = (className: string, place: string): string =>
  `<g class="k-logo-dot ${className}" transform="${place}"><path d="${PART_D}"/></g>`;

const WORD = `<g transform="${WORD_PLACE}">${LETTERS.map(
  ({ d, place }) =>
    `<g class="k-logo-letter"><path${place === null ? '' : ` transform="${place}"`} d="${d}"/></g>`,
).join(
  '',
)}${dot('k-logo-dot-i', 'translate(28 10.2)')}${dot('k-logo-stop', 'translate(127.3 36.2)')}</g>`;

/**
 * The browser tab's icon, as a data address: the icon alone in the copper accent, the light one on
 * a light tab bar and the dark one on a dark bar. The pages' policy lets `img-src` take `data:`.
 */
export const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><style>path{fill:${ACCENT_COLORS.copper.light.accent}}@media (prefers-color-scheme:dark){path{fill:${ACCENT_COLORS.copper.dark.accent}}}</style><path d="${ICON_LEFT}"/><path d="${ICON_RIGHT}"/></svg>`,
)}`;

/** `full`: the icon and the word, viewBox `0 0 180 46`. `mark`: the icon alone, `0 0 34 34`. */
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
  const viewBox = kind === 'full' ? '0 0 180 46' : '0 0 34 34';
  const parts = trusted(kind === 'full' ? `${FULL_ICON}${WORD}` : ICON_PATH);
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
