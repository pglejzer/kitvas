// The editor's operations on a draft's source: a small closed set, each with an exact inverse
// (spec 4a, decision 5). An operation names the element by its id and carries the value the
// person saw before the change, so a write on a file someone else changed can tell whether the
// same place still holds that value (decision 7), and undo is the inverse sent the same way.

import { type Zod, z } from '../../shared/index.ts';

/** An element id as the build makes it: `sections/Pricing:section/Stack/Card.2` (render/domain/sites.ts). */
export const ELEMENT_ID =
  /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*:[A-Za-z0-9_.$-]+(?:\/[A-Za-z0-9_.$-]+)*$/;
/** A prop name as JSX writes it: `variant`, `aria-label`, `data-x`. Never `className`, `key`, `ref`. */
export const PROP_NAME = /^(?!className$|key$|ref$|style$)[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
/** A CSS class name kitvas may read or write. */
export const CLASS_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
/** A CSS property in the editor's set: lower-case, hyphens. Custom properties are never edited. */
export const CSS_PROPERTY = /^[a-z][a-z-]{0,47}$/;
/** A kit token variable: `--kit-space-md`. */
export const TOKEN_VAR = /^--kit-[A-Za-z0-9_-]{1,80}$/;

export const MAX_TEXT = 2_000;
export const MAX_RAW = 200;
/** Operations in one request: one gesture, or one undo of a gesture (a move across sections with
 * its class rules is several). */
export const MAX_OPS = 50;
/** JSX source an op carries: an inserted element, a pasted subtree, an element's whole source. */
export const MAX_SOURCE = 20_000;
/** One hunk's text in a server-made inverse, and a whole file in a `file` op. */
export const MAX_HUNK = 100_000;
export const MAX_FILE = 200_000;
/** `hashOf`: FNV-1a 64-bit, 16 lower-case hex digits. */
export const HASH = /^[0-9a-f]{16}$/;
/** A kit component tag: `Stack`, `Card.Header`. */
export const COMPONENT_TAG = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?$/;
/** A section id of the layout (the drafts module's `SECTION_ID`) and a draft slug (`SLUG`). */
export const SECTION = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const DRAFT_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/**
 * A file inside a version that a server-made inverse may change: a section's or a sketch's TSX, a
 * section's SCSS, the layout. Never the generated `index.tsx` or `index.scss`.
 */
export const EDIT_FILE =
  /^(?:src\/tsx\/sections\/[A-Za-z0-9]+\.tsx|src\/tsx\/sketches\/[A-Za-z0-9]+\.tsx|src\/scss\/sections\/_?[a-z][a-z0-9-]*\.scss|md\/layout\.md)$/;

export const ElementIdSchema = z.string().max(200).regex(ELEMENT_ID);

/**
 * The states a style may be set for (spec 4c, goal 1): written as `&:hover`, `&:focus-visible`,
 * `&:active` in SCSS, and as the `hover:`, `focus-visible:`, `active:` prefixes in Tailwind.
 */
export const STYLE_STATES = ['hover', 'focus-visible', 'active'] as const;
export type StyleState = (typeof STYLE_STATES)[number];
/** Widest breakpoint a context may name, in CSS px. */
export const MAX_BREAKPOINT = 10_000;
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
/** One utility class of a Tailwind draft with its prefixes: `p-4`, `md:hover:bg-ink`, `w-[13px]`. */
export const UTILITY = /^[A-Za-z0-9:_\-[\]/.#%(),]{1,120}$/;
/** The place of an item in a `.map`: 0 for the first rendered element of that id. */
const ItemSchema = z.number().int().min(0).max(10_000);
/** The most `.map` lists around one element that a text's path names (ADR 0060). */
export const MAX_LIST_DEPTH = 8;

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
/** Where a moved or inserted element goes: beside the anchor, or inside it as first or last child. */
export const PLACES = ['before', 'after', 'first', 'last'] as const;
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
     * `&:hover`, both). `newBlock`: that block did not exist and this op creates it.
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
  // Data lists (spec 4c, goal 9): `id` is the element inside the `.map` callback, `item` which
  // rendered copy of it, which is the array element at that index. Server-made inverses.
  /** The array element at `item` to index `to` (the others shift). */
  z.strictObject({ op: z.literal('moveItem'), ...target, item: ItemSchema, to: ItemSchema }),
  /** A copy of the array element at `item`, right after it. */
  z.strictObject({ op: z.literal('duplicateItem'), ...target, item: ItemSchema }),
  z.strictObject({ op: z.literal('removeItem'), ...target, item: ItemSchema }),
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
    path: z.array(ItemSchema).max(MAX_LIST_DEPTH).optional(),
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
export type Place = (typeof PLACES)[number];
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
/** The ops of 4b: structure, sections, and the server-made inverses. */
export type StructuralOp = Exclude<EditOp, SimpleOp>;

const SIMPLE: ReadonlySet<EditOpKind> = new Set([
  'setProp',
  'removeProp',
  'setText',
  'setStyle',
  'removeStyle',
  'addClass',
  'removeClass',
  'setUtility',
]);

export const isStructural = (op: EditOp): op is StructuralOp => !SIMPLE.has(op.op);

/** Every element id `op` names: its element, its anchor, the ends of a wrap. Section and file ops name none. */
export function idsOf(op: EditOp): string[] {
  switch (op.op) {
    case 'insertElement':
      return [op.anchor];
    case 'moveElement':
      return [op.id, op.anchor];
    case 'wrapElements':
      return [op.first, op.last];
    case 'moveSection':
    case 'insertSection':
    case 'removeSection':
    case 'patch':
    case 'file':
      return [];
    default:
      return [op.id];
  }
}

/** Where an operation writes: the element's TSX file, or its section's SCSS file. */
export type OpTarget = 'tsx' | 'scss';

export const targetOf = (op: SimpleOp): OpTarget =>
  op.op === 'setStyle' || op.op === 'removeStyle' ? 'scss' : 'tsx';

/** `sections/Pricing:section/Stack` lives in `src/tsx/sections/Pricing.tsx`. */
export function fileOfId(id: string): string {
  const stem = id.slice(0, id.indexOf(':'));
  return `src/tsx/${stem}.tsx`;
}

/**
 * The 64-bit FNV-1a hash of a text, as 16 hex digits: the `hash` of a subtree (spec 4b,
 * decision 5). Not for security: it only tells the editor's copy from another writer's.
 */
export function hashOf(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/** The operation that undoes `op` once `op` has been applied (4a ops; 4b's come from the server). */
export function inverse(op: SimpleOp): SimpleOp {
  switch (op.op) {
    case 'setProp':
      return op.before === null
        ? { op: 'removeProp', id: op.id, name: op.name, before: op.value, after: op.after }
        : { ...op, value: op.before, before: op.value };
    case 'removeProp':
      return {
        op: 'setProp',
        id: op.id,
        name: op.name,
        value: op.before,
        before: null,
        after: op.after,
      };
    case 'setText':
      return { ...op, value: op.before, before: op.value };
    case 'setStyle':
      return op.before === null
        ? {
            op: 'removeStyle',
            id: op.id,
            className: op.className,
            property: op.property,
            before: op.value,
            dropRule: op.newRule,
            ...(op.context === undefined
              ? {}
              : { context: op.context, dropBlock: op.newBlock === true }),
          }
        : { ...op, value: op.before, before: op.value };
    case 'removeStyle':
      return {
        op: 'setStyle',
        id: op.id,
        className: op.className,
        property: op.property,
        value: op.before,
        before: null,
        newRule: op.dropRule,
        ...(op.context === undefined
          ? {}
          : { context: op.context, newBlock: op.dropBlock === true }),
      };
    case 'addClass':
      return { op: 'removeClass', id: op.id, className: op.className };
    case 'removeClass':
      return { op: 'addClass', id: op.id, className: op.className };
    case 'setUtility':
      return { ...op, value: op.before, before: op.value };
  }
}

/** The inverse of a gesture: the inverses in reverse order. */
export const inverseAll = (ops: readonly SimpleOp[]): SimpleOp[] => [...ops].reverse().map(inverse);

/** How a style value is written into SCSS (decision 3); the marker follows the semicolon. */
export function styleText(value: StyleValue): { value: string; offKit: boolean } {
  return 'token' in value
    ? { value: `var(${value.token})`, offKit: false }
    : { value: value.raw, offKit: value.mark !== false };
}

export const OFF_KIT_MARKER = '/* off-kit */';
