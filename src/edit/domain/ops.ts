// The editor's operations on a draft's source: a small closed set, each with an exact inverse
// (spec 4a, decision 5). An operation names the element by its id and carries the value the
// person saw before the change, so a write on a file someone else changed can tell whether the
// same place still holds that value (decision 7), and undo is the inverse sent the same way.
// Here are the schemas and their types; the patterns and limits they are built from are in
// `op-limits.ts`, and what an op does without its schema in `op-kinds.ts`. This file re-exports
// both, so the rest of `src/` imports the ops from here alone.

import { type Zod, z } from '../../shared/index.ts';
import {
  CLASS_NAME,
  COMPONENT_TAG,
  CSS_PROPERTY,
  DRAFT_SLUG,
  EDIT_FILE,
  ELEMENT_ID,
  HASH,
  MAX_BREAKPOINT,
  MAX_FILE,
  MAX_HUNK,
  MAX_LIST_DEPTH,
  MAX_RAW,
  MAX_SOURCE,
  MAX_TEXT,
  PLACES,
  PROP_NAME,
  SECTION,
  STYLE_STATES,
  TOKEN_VAR,
  UTILITY,
} from './op-limits.ts';

export * from './op-kinds.ts';
export * from './op-limits.ts';

export const ElementIdSchema = z.string().max(200).regex(ELEMENT_ID);

/**
 * Where a style edit applies (spec 4c, goal 1). `width`: from this breakpoint up (a kit breakpoint,
 * `@media (min-width: <width>px)`), `null` for all widths. `state`: `null` for the resting state.
 * An op without a context is the base, as in 4a.
 */
export const StyleContextSchema = z.strictObject({
  width: z.number().int().min(1).max(MAX_BREAKPOINT).nullable(),
  state: z.enum(STYLE_STATES).nullable(),
});
export type StyleContext = Zod.infer<typeof StyleContextSchema>;
/** The place of an item in a `.map`: 0 for the first rendered element of that id. */
const ItemSchema = z.number().int().min(0).max(10_000);
/** A copy's place in each `.map` around its element, outer first (ADR 0060). */
const PathSchema = z.array(ItemSchema).max(MAX_LIST_DEPTH);

/** A literal prop value: `name="v"`, `name={3}`, `name` (true) or `name={false}`. */
export const PropValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('string'), value: z.string().max(MAX_TEXT) }),
  z.strictObject({ kind: z.literal('number'), value: z.number().finite() }),
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
]);

/**
 * A style value: a kit token, written `var(--kit-…)`; or a raw value the person typed, written as
 * typed and followed by the off-kit marker (decision 3). A raw value has no `;`, `{`, `}`, `/*`.
 * `mark: false`: a value someone wrote without the marker (`display: flex`, `padding: 12px`), so a
 * `before` matches it and its inverse writes it back without one.
 */
export const StyleValueSchema = z.union([
  z.strictObject({ token: z.string().regex(TOKEN_VAR) }),
  z.strictObject({
    raw: z
      .string()
      .trim()
      .min(1)
      .max(MAX_RAW)
      .regex(/^(?!.*\/\*)[^;{}\n\r]+$/),
    mark: z.literal(false).optional(),
  }),
]);

const target = { id: ElementIdSchema };
const HashSchema = z.string().regex(HASH);
const SourceSchema = z.string().min(1).max(MAX_SOURCE);
const place = { anchor: ElementIdSchema, place: z.enum(PLACES) };
/** The subtree as the editor last saw it (`Inspect.hash`); another one there is a conflict. */
const seen = { hash: HashSchema.optional() };
const SectionSchema = z.string().max(48).regex(SECTION);
const HunkSchema = z.strictObject({
  find: z.string().max(MAX_HUNK),
  replace: z.string().max(MAX_HUNK),
});
const style = {
  ...target,
  className: z.string().regex(CLASS_NAME),
  property: z.string().regex(CSS_PROPERTY),
};

export const EditOpSchema = z.discriminatedUnion('op', [
  /**
   * `before: null`: the prop was not written, and it is inserted right after the prop `after`
   * (`null`: right after the tag name). An existing prop keeps its place; `after` is then only
   * carried for the inverse.
   */
  z.strictObject({
    op: z.literal('setProp'),
    ...target,
    name: z.string().regex(PROP_NAME),
    value: PropValueSchema,
    before: PropValueSchema.nullable(),
    after: z.string().regex(PROP_NAME).nullable(),
  }),
  /** `after`: the prop written just before it (`null`: it is the first), so undo puts it back there. */
  z.strictObject({
    op: z.literal('removeProp'),
    ...target,
    name: z.string().regex(PROP_NAME),
    before: PropValueSchema,
    after: z.string().regex(PROP_NAME).nullable(),
  }),
  /** The element's one plain text child, without its leading and trailing whitespace. */
  z.strictObject({
    op: z.literal('setText'),
    ...target,
    value: z.string().max(MAX_TEXT),
    before: z.string().max(MAX_TEXT),
  }),
  /**
   * In the top-level rule `.className` of the element's section SCSS; `before: null` adds the
   * declaration at the end of the rule. `newRule`: the rule did not exist, and this op creates it at
   * the end of the file.
   */
  z.strictObject({
    op: z.literal('setStyle'),
    ...style,
    value: StyleValueSchema,
    before: StyleValueSchema.nullable(),
    newRule: z.boolean(),
    /**
     * Spec 4c: the declaration goes into the rule's nested block for this context (`@media`,
     * `&:hover`, both). `newBlock`: the op may create that block, when the class's last rule has
     * none for the context.
     */
    context: StyleContextSchema.optional(),
    newBlock: z.boolean().optional(),
  }),
  /** `dropRule`: when the rule's body is empty afterwards, the rule goes too (the inverse of `newRule`). */
  z.strictObject({
    op: z.literal('removeStyle'),
    ...style,
    before: StyleValueSchema,
    dropRule: z.boolean(),
    /** Spec 4c: from the context's block; `dropBlock`: the block goes when its body is empty. */
    context: StyleContextSchema.optional(),
    dropBlock: z.boolean().optional(),
  }),
  /**
   * Spec 4c, Tailwind drafts: one utility class in the element's literal `className`. `before: null`
   * adds `value` at the end; `value: null` removes `before`; both set swaps `before` for `value` in
   * its place.
   */
  z.strictObject({
    op: z.literal('setUtility'),
    ...target,
    value: z.string().regex(UTILITY).nullable(),
    before: z.string().regex(UTILITY).nullable(),
  }),
  /** Writes `className="…"` on an element that has no `className` (decision 3). */
  z.strictObject({ op: z.literal('addClass'), ...target, className: z.string().regex(CLASS_NAME) }),
  /** The inverse of `addClass`: removes `className="<className>"` only when it is exactly that. */
  z.strictObject({
    op: z.literal('removeClass'),
    ...target,
    className: z.string().regex(CLASS_NAME),
  }),
  // Structure (spec 4b, decision 2). Their inverses are made by the server (decision 4).
  /** The element and its subtree to `place` of `anchor`, in its file or another section's. */
  z.strictObject({ op: z.literal('moveElement'), ...target, ...place, ...seen }),
  /** `source`: one element or one fragment, as JSX; it may name kit components and literals. */
  z.strictObject({
    op: z.literal('insertElement'),
    ...place,
    source: SourceSchema,
    /** The TSX file a copied or cut subtree came from: its class rules come along (task B4). */
    from: z.string().regex(EDIT_FILE).optional(),
  }),
  z.strictObject({ op: z.literal('removeElement'), ...target, ...seen }),
  /**
   * The siblings from `first` to `last` (the same parent, in order) inside a new element whose
   * opening tag is `open` (`<Stack direction="row">`); its closing tag follows from the name.
   */
  z.strictObject({
    op: z.literal('wrapElements'),
    first: ElementIdSchema,
    last: ElementIdSchema,
    open: z.string().min(3).max(2_000),
    ...seen,
  }),
  /** The element replaced by its children; a lone root's children go into a fragment. */
  z.strictObject({ op: z.literal('unwrapElement'), ...target, ...seen }),
  /** Another kit component in the element's place, with the props both have, and its children. */
  z.strictObject({
    op: z.literal('replaceTag'),
    ...target,
    tag: z.string().max(80).regex(COMPONENT_TAG),
    ...seen,
  }),
  /** The element's whole source swapped for `source` (paste over). */
  z.strictObject({ op: z.literal('replaceElement'), ...target, source: SourceSchema, ...seen }),
  /** The element as it was when the session started (the previous version), via the rename log. */
  z.strictObject({ op: z.literal('resetElement'), ...target, ...seen }),
  /** Sections of the layout; `after: null` puts the section first. */
  z.strictObject({
    op: z.literal('moveSection'),
    section: SectionSchema,
    after: SectionSchema.nullable(),
  }),
  /** A section of another draft with the same kit, copied with a free id. */
  z.strictObject({
    op: z.literal('insertSection'),
    from: z.strictObject({ slug: z.string().regex(DRAFT_SLUG), section: SectionSchema }),
    after: SectionSchema.nullable(),
  }),
  z.strictObject({ op: z.literal('removeSection'), section: SectionSchema }),
  // Data lists (spec 4c, goal 9; ADR 0065): `id` is the root element a `.map` callback returns,
  // `item` which array element. Server-made inverses. `path`: the copy's place in each `.map`
  // around the element, outer first (ADR 0060); with it the op is for the innermost list of that
  // copy (the features of one plan) and `item` is the path's last place, for the change list.
  /**
   * The array element at `item` to index `to` (the others shift). `toPath`, with `path` and as
   * long: where the item goes. Places before the last that differ name the same list of another
   * parent: the item leaves its array and stands in that one at `toPath`'s last place, counted
   * among that array's items as they are; `to` is then that place.
   */
  z.strictObject({
    op: z.literal('moveItem'),
    ...target,
    item: ItemSchema,
    to: ItemSchema,
    path: PathSchema.optional(),
    toPath: PathSchema.optional(),
  }),
  /** A copy of the array element at `item`, right after it. */
  z.strictObject({
    op: z.literal('duplicateItem'),
    ...target,
    item: ItemSchema,
    path: PathSchema.optional(),
  }),
  z.strictObject({
    op: z.literal('removeItem'),
    ...target,
    item: ItemSchema,
    path: PathSchema.optional(),
  }),
  /** The string literal field the element's text reads (`{plan.title}`) of the item at `item`. */
  z.strictObject({
    op: z.literal('setItemText'),
    ...target,
    item: ItemSchema,
    value: z.string().max(MAX_TEXT),
    before: z.string().max(MAX_TEXT),
    /**
     * ADR 0060: the copy's place in each `.map` around the element, outer first (`[]` in none).
     * With it the op writes the one string literal of the file that renders `before` in that copy
     * (a branch of a condition, a field of the item, of an outer item's list too), in its own
     * quotes; `item` is then the last place, for the change list.
     */
    path: PathSchema.optional(),
  }),
  /**
   * ADR 0072, "This item": the element's `className` gets its style class's modifier named by
   * the list's key (`plans__card--${plan.id}`), once. `className` is the class that makes for the
   * copy at `path` (`plans__card--pro`, as the inspect's `itemScope` says); another one is a
   * conflict. A `className` that gives the modifier already is left alone. Server-made inverse.
   */
  z.strictObject({
    op: z.literal('addItemClass'),
    ...target,
    path: PathSchema,
    className: z.string().regex(CLASS_NAME),
  }),
  /**
   * Server-made inverses (decision 4). `patch`: each hunk's `find` occurs exactly once in the
   * file and becomes `replace`; anything else is a conflict. `file`: the whole file becomes
   * `text` (`null` removes it) when its text hashes to `before` (`null`: it must not exist).
   */
  z.strictObject({
    op: z.literal('patch'),
    file: z.string().regex(EDIT_FILE),
    hunks: z.array(HunkSchema).min(1).max(50),
  }),
  z.strictObject({
    op: z.literal('file'),
    file: z.string().regex(EDIT_FILE),
    text: z.string().max(MAX_FILE).nullable(),
    before: HashSchema.nullable(),
  }),
]);

export type PropValue = Zod.infer<typeof PropValueSchema>;
export type StyleValue = Zod.infer<typeof StyleValueSchema>;
export type EditOp = Zod.infer<typeof EditOpSchema>;
export type EditOpKind = EditOp['op'];
export type Hunk = Zod.infer<typeof HunkSchema>;
/** The ops of 4a: one element, one value, an inverse the client can make itself. */
export type SimpleOp = Extract<
  EditOp,
  {
    op:
      | 'setProp'
      | 'removeProp'
      | 'setText'
      | 'setStyle'
      | 'removeStyle'
      | 'addClass'
      | 'removeClass'
      | 'setUtility';
  }
>;
/** ADR 0072: one list item's class. Not a 4a op (its inverse is server-made), nor a 4b shape op. */
export type ItemClassOp = Extract<EditOp, { op: 'addItemClass' }>;
/** The ops of 4b: structure, sections, and the server-made inverses. */
export type StructuralOp = Exclude<EditOp, SimpleOp | ItemClassOp>;
