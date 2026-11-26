// What the editor's operations are and do without their schemas (spec 4a, decision 5): which kind
// an op is, the element ids it names, where it writes, its exact inverse, how a style value is
// written, and the hash of a subtree. It imports types only, so the studio page uses it as it is
// (ADR 0080); `ops.ts` re-exports every name.

import type { EditOp, EditOpKind, ItemClassOp, SimpleOp, StructuralOp, StyleValue } from './ops.ts';

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

/** A 4a op: its inverse is made by `inverse`, on the page as on the server. */
export const isSimpleOp = (op: EditOp): op is SimpleOp => SIMPLE.has(op.op);

/** Not a 4a op: the answer's inverse is made by the server (decision 4). */
export const isStructural = (op: EditOp): op is StructuralOp | ItemClassOp => !SIMPLE.has(op.op);

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
