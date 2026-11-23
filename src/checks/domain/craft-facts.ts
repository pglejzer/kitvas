// What the `craft` pass measures on a sketch board: each sketch's SVG and the kit's own icons
// next to it (ADR 0045). Read by the craft rules.

/** One rendered SVG. `stroke` is in viewBox units; null for a filled icon with no stroke. */
export type SvgFacts = {
  /** `A`, `B` or `C` for a sketch; null for a kit icon. */
  sketch: string | null;
  /**
   * Index in the visit's facts nodes of the sketch's block (`[data-craft-sketch]`); null for a kit
   * icon, or when the facts walk did not list the block. A finding then is page-level.
   */
  node: number | null;
  /** Normalised to four numbers with single spaces; `''` when the svg has none. */
  viewBox: string;
  stroke: number | null;
  filled: boolean;
  /** `round`, `square` or `butt`. */
  caps: string;
  /** Colours other than currentColor, none and transparent, as `#rrggbbaa`. */
  fixedColours: string[];
  /** The thinnest painted line at 16 px, in device pixels; null when nothing is painted. */
  thinnestPx16: number | null;
  /** The same at 32 px, for logos. */
  thinnestPx32: number | null;
};

export type CraftFacts = {
  /** The draft's craft subject: `component`, `icon` or `logo`. */
  subject: string;
  sketches: SvgFacts[];
  kit: SvgFacts[];
  /** Per sketch, its lowest contrast on the light and on the dark ground of the board. */
  logoContrast: { sketch: string; light: number; dark: number }[];
  /** Sketches that have a `[data-craft-tone="mono"]` variant. */
  mono: string[];
};
