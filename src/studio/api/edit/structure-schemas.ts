// Shapes of the editor's structure API (spec 4b; plan 14, C10). The routes are in
// `structure-routes.ts` (task B6); the rules are in the edit module.

import { ElementIdSchema, HASH, REFUSALS } from '../../../edit/index.ts';
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
  /** Why it cannot be moved, deleted or duplicated as an element; `null` when it can. */
  movable: z.enum(REFUSALS).nullable(),
  /**
   * It is what a `.map` over a literal array of the file returns, one copy per item: a drag in
   * the frame reorders the items of the data (ADR 0059). Left out means `false`.
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
export type Subtree = Zod.infer<typeof SubtreeSchema>;
