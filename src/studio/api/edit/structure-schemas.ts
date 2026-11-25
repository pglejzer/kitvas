// Shapes of the editor's structure API (spec 4b; plan 14, C10). The routes are in
// `structure-routes.ts` (task B6); the rules are in the edit module.

import { BACKDROP } from '../../../checks/index.ts';
import { ElementIdSchema, HASH, MAX_LIST_DEPTH, REFUSALS } from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';
import { EtagsSchema } from './edit-schemas.ts';

const Version = z.number().int().min(1);

/** One element of the latest version, as its source writes it, in document order. */
export const StructureEntrySchema = z.strictObject({
  id: ElementIdSchema,
  /** The path inside the version: `src/tsx/sections/Hero.tsx`. */
  file: z.string(),
  /** Where its `<` is in `file`, 1-based, as the JSX runtime gives it: for "Copy code location". */
  line: z.number().int().min(1),
  column: z.number().int().min(1),
  tag: z.string(),
  /** The enclosing element's id; `null` for a root a function returns. */
  parent: ElementIdSchema.nullable(),
  hash: z.string().regex(HASH),
  /** The element's one plain text child, cut to 80 characters; `null` when it has none. */
  text: z.string().max(80).nullable(),
  /** The names of the props it writes, in order: with the tag and the text, what Claude's moves are matched by. */
  props: z.array(z.string()),
  /** The kit component it is; `null` for a plain element. */
  component: z.string().nullable(),
  /**
   * Why it cannot be moved, deleted or duplicated as an element; `null` when it can. It follows
   * the element's own place (ADR 0065): a plain child inside a list item's template moves, and
   * the move changes the template every item shares.
   */
  movable: z.enum(REFUSALS).nullable(),
  /**
   * The ids of the root elements of the `.map` lists around it, outer first, its own id last
   * when it is such a root (ADR 0065); `[]` in no list; `null` when the copies of a list around
   * it cannot be counted. Left out means `[]`.
   */
  lists: z.array(ElementIdSchema).max(MAX_LIST_DEPTH).nullable().optional(),
  /**
   * It is the root a `.map` callback returns, at any depth, and the array of its first copy is
   * a literal of the file: a drag in the frame reorders the items of the data (ADR 0059, ADR
   * 0065). Left out means `false`.
   */
  item: z.boolean().optional(),
  /** It takes an element dropped inside: `children: node` in the catalog, or a non-void element. */
  accepts: z.boolean(),
  /** Its children mix text and elements: no drop slots between them (decision 6). */
  mixed: z.boolean(),
  /** A button, a link, a form control: never dropped inside another such element. */
  interactive: z.boolean(),
  /** `section`: the element a section returns; `slot`: the JSX of a prop. */
  root: z.enum(['section', 'slot']).nullable(),
});

/** `GET /api/v1/drafts/{slug}/structure`. */
export const StructureSchema = z.strictObject({
  version: Version,
  /**
   * The latest version's folder on this machine, with forward slashes: a `file` joined to it is
   * the path of the source. It is the person's own draft folder, shown only on their own studio.
   */
  folder: z.string(),
  etags: EtagsSchema,
  elements: z.array(StructureEntrySchema),
  /** The layout's sections in order, each with the element of `index.tsx` that renders it. */
  sections: z.array(
    z.strictObject({ id: z.string(), element: ElementIdSchema.nullable(), purpose: z.string() }),
  ),
});

/** Rendered previews of the kit for the Insert pane (ADR 0075). */
export const PreviewsSchema = z.strictObject({
  /** 'ready': made for the kit as it is now; 'making': a job is making them, ask again; 'none': none can be made (no browser, the catalog failed). */
  state: z.enum(['ready', 'making', 'none']),
  /** The kit page's background as `#rrggbb` or `rgb(…)`/`rgba(…)` (checked by a regex), for the tile behind a preview; null when unknown. */
  backdrop: z.string().regex(BACKDROP).nullable(),
  /** Each component's preview image address (usable as `<img src>` on the studio page), by component name (roots and parts); a component without one is absent. */
  components: z.record(z.string(), z.string()),
  /** One image of the kit's icons in a grid: `columns` cells a row, each `cell` px square, in `names` order (cell i at x = (i % columns) * cell, y = floor(i / columns) * cell); null when not made. */
  icons: z
    .strictObject({
      src: z.string(),
      cell: z.number().int().positive(),
      columns: z.number().int().positive(),
      names: z.array(z.string()),
    })
    .nullable(),
});

/** `GET /api/v1/drafts/{slug}/palette`: what the insert palette offers (spec 4b, decision 10). */
export const PaletteSchema = z.strictObject({
  components: z.array(
    z.strictObject({
      name: z.string(),
      category: z.string(),
      /** For a part (`Card.Header`), its root (`Card`): inserted only inside it. */
      parent: z.string().nullable(),
      accepts: z.boolean(),
      /** Required props with no example and no default: such a component cannot be inserted bare. */
      required: z.array(z.string()),
      examples: z.array(
        z.strictObject({ title: z.string(), code: z.string(), imports: z.array(z.string()) }),
      ),
    }),
  ),
  /** The kit's icon component and the names it takes; `null` when the kit has no icons. */
  icons: z.strictObject({ component: z.string(), names: z.array(z.string()) }).nullable(),
  /** Sections of other drafts that use the same kit, their latest version. */
  sections: z.array(z.strictObject({ slug: z.string(), section: z.string(), purpose: z.string() })),
  /** Rendered previews of the kit for the Insert pane (ADR 0075). */
  previews: PreviewsSchema,
});

/** `GET /api/v1/drafts/{slug}/subtree?id=`: an element's whole source, for copy and cut. */
export const SubtreeSchema = z.strictObject({
  id: ElementIdSchema,
  file: z.string(),
  hash: z.string().regex(HASH),
  source: z.string(),
});

export type StructureEntry = Zod.infer<typeof StructureEntrySchema>;
export type Structure = Zod.infer<typeof StructureSchema>;
export type Palette = Zod.infer<typeof PaletteSchema>;
export type Previews = Zod.infer<typeof PreviewsSchema>;
export type Subtree = Zod.infer<typeof SubtreeSchema>;
