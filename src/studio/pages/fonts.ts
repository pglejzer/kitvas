// The studio's typeface (ADR 0057): Figtree, served by the studio itself from the font package.
// No font service: the page policy allows only the studio's own origin, the studio works
// offline, and nobody else learns that a person opened it. Without the files the pages fall
// back to the system's font.

/** The package the files come from (`files/<name>` in it), loaded through `src/shared/deps/`. */
export const FONT_PACKAGE = '@fontsource-variable/figtree';

/** One variable file per script range, as the package cuts them. */
export const FONT_FACES = [
  {
    file: 'figtree-latin-wght-normal.woff2',
    range:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    file: 'figtree-latin-ext-wght-normal.woff2',
    range:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
] as const;

export type FontFile = (typeof FONT_FACES)[number]['file'];

export const FONT_FILES: readonly FontFile[] = FONT_FACES.map((face) => face.file);

export const FONT_TYPE = 'font/woff2';
