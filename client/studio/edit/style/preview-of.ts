// What the frame can show of an operation before the build confirms it (plan 13, task E2). Text,
// a style value and a class show at once; a prop needs the component to render again, and a
// removed declaration falls back to a value only the stylesheet knows, so both wait for the build.

import type { EditOp, StyleContext } from '../../../../src/edit/index.ts';
import { MAX_STYLE_VALUE, type PreviewChange } from '../../../channel/edit-protocol.ts';

type StyleValue = Extract<EditOp, { op: 'setStyle' }>['value'];

/**
 * The width and state a style op writes (spec 4c); `null` for the base and for any other op. Its
 * preview is for the cards at least that wide, and shows while the state is forced (task B).
 */
export function previewContext(op: EditOp): StyleContext | null {
  if (op.op !== 'setStyle' && op.op !== 'removeStyle') return null;
  const { context } = op;
  if (context === undefined || (context.width === null && context.state === null)) return null;
  return context;
}

/**
 * A style value as the SCSS gets it. The same rule as `styleText` in `src/edit/domain/ops.ts`,
 * repeated here because the client may not import values from `src/`.
 */
function cssOf(value: StyleValue): string {
  return 'token' in value ? `var(${value.token})` : value.raw;
}

/**
 * The channel refuses a whole `preview` message for one such value (`change` in
 * `client/channel/edit-protocol.ts`), so it is left out here and the build shows it.
 */
const sendable = (css: string): boolean => css.length <= MAX_STYLE_VALUE && !/[;{}<>]/.test(css);

/** The preview of `op`, or `null` when only the build can show it. */
export function previewOf(op: EditOp): PreviewChange | null {
  switch (op.op) {
    case 'setText':
      return { id: op.id, kind: 'text', value: op.value };
    case 'setStyle': {
      const value = cssOf(op.value);
      return sendable(value) ? { id: op.id, kind: 'style', property: op.property, value } : null;
    }
    case 'addClass':
      return { id: op.id, kind: 'class', className: op.className, on: true };
    case 'removeClass':
      return { id: op.id, kind: 'class', className: op.className, on: false };
    default:
      // Props and removed styles need the build, and so does a utility class: its CSS is made
      // from the source at build time. Structure moves in the frame by itself (task C2).
      return null;
  }
}
