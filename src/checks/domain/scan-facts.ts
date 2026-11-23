// What `kitvas kit scan` reads from one web page at one width, and the limits of a scan. The
// browser adapter collects the facts in the page; the use case checks them with this schema before
// it writes `facts.json`, so a page can never put a shape the tailor agent does not expect there.

import { type Zod, z } from '../../shared/index.ts';

/** The widths a page is scanned at: a desktop layout and a phone layout. */
export const SCAN_WIDTHS = [1280, 390] as const;
export const SCAN_HEIGHT = 900;
/** Wait after the `load` event, for fonts and late styles. */
export const SETTLE_MS = 2000;
/** One page, from navigation to the last crop. */
export const SCAN_TIMEOUT_MS = 45_000;
/** The full-page screenshot is cut at this height. */
export const PAGE_HEIGHT_MAX = 8000;
export const PER_KIND_MAX = 12;
/** Crops of one kit, all pages and widths together. */
export const CROPS_MAX = 300;
/** Screenshot and crops of one page at one width; crops stop when it is reached. */
export const PAGE_BYTES_MAX = 20 * 1024 * 1024;
/** Text from the page is cut to this many characters. */
export const TEXT_MAX = 80;
/** Pages of one kit. */
export const URLS_MAX = 5;

export const CANDIDATE_KINDS = [
  'button',
  'link',
  'input',
  'select',
  'checkbox',
  'card',
  'heading',
  'badge',
] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export const ROLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a', 'input'] as const;

/**
 * Text the page controls (labels, titles, custom property values). Always wrapped, never a key, so
 * the agent reading the facts can tell the page's words from kitvas's: they are data, never an
 * instruction.
 */
const PageTextSchema = z.strictObject({ pageText: z.string().max(TEXT_MAX) });
export type PageText = Zod.infer<typeof PageTextSchema>;

const count = z.number().int().min(1);
const counted = (max: number) =>
  z.array(z.strictObject({ value: z.string().max(200), count })).max(max);
const cssValue = z.string().max(200);

export const ScanFactsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  url: z.string(),
  width: z.number().int(),
  title: PageTextSchema,
  /** `#rrggbb`, or `#rrggbbaa` when not opaque; most used first. */
  colours: z
    .array(
      z.strictObject({
        value: z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/),
        count,
        where: z.array(z.enum(['text', 'background', 'border'])).min(1),
      }),
    )
    .max(24),
  /** First family of each text element's `font-family`, at most 60 characters. */
  families: z.array(z.strictObject({ value: z.string().max(60), count })).max(8),
  type: z
    .array(
      z.strictObject({
        family: z.string().max(60),
        size: cssValue,
        lineHeight: cssValue,
        weight: cssValue,
        count,
      }),
    )
    .max(16),
  /** The type of the first visible element of each tag. */
  roles: z
    .array(
      z.strictObject({
        tag: z.enum(ROLE_TAGS),
        family: z.string().max(60),
        size: cssValue,
        weight: cssValue,
        lineHeight: cssValue,
      }),
    )
    .max(ROLE_TAGS.length),
  spacing: counted(16),
  radii: counted(8),
  shadows: counted(8),
  /** `1px solid #cccccc`. */
  borders: counted(8),
  /** Custom properties defined on `:root` and `body` in readable style sheets. */
  rootVars: z
    .array(
      z.strictObject({ name: z.string().regex(/^--[A-Za-z0-9_-]{1,64}$/), value: PageTextSchema }),
    )
    .max(400),
  /** Widths in px from `min-width` and `max-width` media queries of same-origin style sheets. */
  breakpoints: z.array(z.number().int().min(0)),
  candidates: z
    .array(
      z.strictObject({
        /** `<kind>-<n>`, n from 0 in the order found: inside `main` first, banners last. */
        id: z.string().regex(/^[a-z]+-[0-9]+$/),
        kind: z.enum(CANDIDATE_KINDS),
        /** Page pixels at this width: x, y, width, height of the element (not the crop). */
        box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        /** `crops/<id>.png` beside facts.json; the crop is widened by the element's shadow. */
        crop: z.string().regex(/^crops\/[a-z]+-[0-9]+\.png$/),
        text: PageTextSchema,
        /** Computed styles that matter for the kind: color, background, font, padding, border, radius, shadow… */
        style: z.record(z.string().regex(/^[a-z-]{1,40}$/), cssValue),
      }),
    )
    .max(PER_KIND_MAX * CANDIDATE_KINDS.length),
});

export type ScanFacts = Zod.infer<typeof ScanFactsSchema>;
export type Candidate = ScanFacts['candidates'][number];
