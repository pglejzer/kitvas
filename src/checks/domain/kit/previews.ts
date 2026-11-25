// The previews of a kit for the editor's Insert pane (ADR 0075): one PNG per component and one of
// the icon sheet, in a folder of the kit's catalog folder beside `build/`, and the stamp that says
// which catalog build they were shot from. `app/kit-previews.ts` makes them; the studio serves them.

import { type Zod, z } from '../../../shared/index.ts';

/** Inside the catalog folder (`catalogDir`): the previews, and their stamp, written last. */
export const PREVIEWS_DIR = 'previews';
export const PREVIEWS_STAMP = 'previews/previews.json';

/** Bump when the previews change shape or look (viewport, scale, box), so old ones are made again. */
export const PREVIEWS_FORMAT = 2;

/**
 * The page a component is shot in, in CSS pixels, and device pixels per CSS pixel: sharp tiles. The
 * page is narrow, so a component as wide as its page (a field, a card) is shot at 240 px and still
 * reads in a tile of about 90 px; a small one (a button) is the same at any width.
 */
export const SHOT_VIEWPORT = { width: 240, height: 480 } as const;
export const SHOT_SCALE = 2;

/** A colour the studio may set as the tile's backdrop: `#rrggbb`, or `rgb(…)` / `rgba(…)`. */
export const BACKDROP = /^(?:#[0-9a-fA-F]{6}|rgba?\([0-9.,%/ ]{5,60}\))$/;

/** One set of previews: `v<format>-<16 hex of the catalog key>`, so every set has new addresses. */
export const PREVIEW_FOLDER = /^v[1-9][0-9]{0,2}-[0-9a-f]{16}$/;
/** The files of a set: a component by its place in kit.json, and the icon sheet. */
export const PREVIEW_FILE = /^(?:component-[0-9]{1,4}|icons)\.png$/;

export const previewFolder = (catalogKey: string): string =>
  `v${PREVIEWS_FORMAT}-${catalogKey.slice(0, 16)}`;
export const componentFile = (index: number): string => `component-${index}.png`;
export const SHEET_FILE = 'icons.png';

export const PreviewsStampSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** The kit's id. */
  kit: z.string(),
  format: z.number().int().min(1),
  /** The key of the catalog build the previews were shot from (`CatalogStamp.key`). */
  catalog: z.string().regex(/^[0-9a-f]{64}$/),
  /** The folder of `previews/` that holds the files. */
  folder: z.string().regex(PREVIEW_FOLDER),
  /** The catalog page's background as the browser painted it; null when it could not be read. */
  backdrop: z.string().regex(BACKDROP).nullable(),
  /** Each component's file in `folder`, by component name; a component without one is absent. */
  components: z.record(z.string(), z.string().regex(PREVIEW_FILE)),
  /** The icon sheet: `columns` cells a row, each `cell` CSS px square, in `names` order. */
  icons: z
    .strictObject({
      file: z.string().regex(PREVIEW_FILE),
      cell: z.number().int().positive(),
      columns: z.number().int().positive(),
      names: z.array(z.string()),
    })
    .nullable(),
});

export type PreviewsStamp = Zod.infer<typeof PreviewsStampSchema>;

/** The stamp in a file's text; `undefined` when missing, not JSON or not of this shape. */
export function readPreviewsStamp(text: string | undefined): PreviewsStamp | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed = PreviewsStampSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Every file a stamp names, relative to its folder. */
export const stampFiles = (stamp: PreviewsStamp): string[] => [
  ...Object.values(stamp.components),
  ...(stamp.icons === null ? [] : [stamp.icons.file]),
];

/**
 * Whether previews were made for the kit as it is now: the stamp is this kit's, of this format,
 * and shot from the catalog build whose key a build would have now (`catalogKey`; `undefined`
 * when the kit cannot be built). Any change of the kit or of kitvas's runtime changes that key.
 */
export function previewsFresh(
  stamp: PreviewsStamp | undefined,
  kitId: string,
  catalogKey: string | undefined,
): boolean {
  return (
    stamp !== undefined &&
    catalogKey !== undefined &&
    stamp.kit === kitId &&
    stamp.format === PREVIEWS_FORMAT &&
    stamp.catalog === catalogKey
  );
}
