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
export const CLASS_NAME = /^[a-z][a-z0-9-]{0,63}$/;
/** A CSS property in the editor's set: lower-case, hyphens. Custom properties are never edited. */
export const CSS_PROPERTY = /^[a-z][a-z-]{0,47}$/;
/** A kit token variable: `--kit-space-md`. */
export const TOKEN_VAR = /^--kit-[A-Za-z0-9_-]{1,80}$/;

export const MAX_TEXT = 2_000;
export const MAX_RAW = 200;
/** Operations in one request: one gesture, or one undo of a gesture. */
export const MAX_OPS = 20;

export const ElementIdSchema = z.string().max(200).regex(ELEMENT_ID);

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
  }),
  /** `dropRule`: when the rule's body is empty afterwards, the rule goes too (the inverse of `newRule`). */
  z.strictObject({
    op: z.literal('removeStyle'),
    ...style,
    before: StyleValueSchema,
    dropRule: z.boolean(),
  }),
  /** Writes `className="…"` on an element that has no `className` (decision 3). */
  z.strictObject({ op: z.literal('addClass'), ...target, className: z.string().regex(CLASS_NAME) }),
  /** The inverse of `addClass`: removes `className="<className>"` only when it is exactly that. */
  z.strictObject({
    op: z.literal('removeClass'),
    ...target,
    className: z.string().regex(CLASS_NAME),
  }),
]);

export type PropValue = Zod.infer<typeof PropValueSchema>;
export type StyleValue = Zod.infer<typeof StyleValueSchema>;
export type EditOp = Zod.infer<typeof EditOpSchema>;
export type EditOpKind = EditOp['op'];
/** Where an operation writes: the element's TSX file, or its section's SCSS file. */
export type OpTarget = 'tsx' | 'scss';

export const targetOf = (op: EditOp): OpTarget =>
  op.op === 'setStyle' || op.op === 'removeStyle' ? 'scss' : 'tsx';

/** `sections/Pricing:section/Stack` lives in `src/tsx/sections/Pricing.tsx`. */
export function fileOfId(id: string): string {
  const stem = id.slice(0, id.indexOf(':'));
  return `src/tsx/${stem}.tsx`;
}

/** The operation that undoes `op` once `op` has been applied. */
export function inverse(op: EditOp): EditOp {
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
      };
    case 'addClass':
      return { op: 'removeClass', id: op.id, className: op.className };
    case 'removeClass':
      return { op: 'addClass', id: op.id, className: op.className };
  }
}

/** The inverse of a gesture: the inverses in reverse order. */
export const inverseAll = (ops: readonly EditOp[]): EditOp[] => [...ops].reverse().map(inverse);

/** How a style value is written into SCSS (decision 3); the marker follows the semicolon. */
export function styleText(value: StyleValue): { value: string; offKit: boolean } {
  return 'token' in value
    ? { value: `var(${value.token})`, offKit: false }
    : { value: value.raw, offKit: value.mark !== false };
}

export const OFF_KIT_MARKER = '/* off-kit */';
