// The built examples of a kit: the stamp a catalog build leaves, and how examples are named.
// The catalog build (app/build-catalog.ts) writes it; the studio's kit page reads it.

import { type Zod, z } from '../../shared/index.ts';

/** Inside the catalog folder (`catalogDir`): the page, and the stamp of the last good build. */
export const CATALOG_PAGE = 'build/html/index.html';
export const CATALOG_STAMP = 'build/json/catalog.json';

/** `<Component>.<n>`: the n-th example (1-based) of a component in `kit.json`. */
export const EXAMPLE_KEY = /^[A-Z][A-Za-z0-9]{0,99}\.[1-9][0-9]{0,2}$/;

export const exampleKey = (component: string, index: number): string => `${component}.${index + 1}`;

export const CatalogStampSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** The kit's id. */
  kit: z.string(),
  /** Hash of everything the build read; equal hashes mean nothing changed. */
  key: z.string(),
  /** Examples in the bundle, in catalog order. */
  shown: z.array(z.string().regex(EXAMPLE_KEY)),
  /** Examples left out because their code does not parse. */
  skipped: z.array(z.string().regex(EXAMPLE_KEY)),
  /** Absolute files the utility CSS was built from (a Tailwind entry and its imports); in the key. */
  utility: z.array(z.string()).optional(),
  /**
   * The names on the icon sheet (`?example=kitvas-icons`, `icon-sheet.ts`), in cell order; absent
   * when the bundle has no sheet.
   */
  icons: z.array(z.string()).optional(),
});

export type CatalogStamp = Zod.infer<typeof CatalogStampSchema>;

/** The stamp in a file's text; `undefined` when missing, not JSON or not of this shape. */
export function readCatalogStamp(text: string | undefined): CatalogStamp | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed = CatalogStampSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
