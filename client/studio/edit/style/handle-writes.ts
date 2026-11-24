// A handle let go in the frame, written (spec 4b, decision 12; plan 14, task D7): the frame's
// `handle` message with `done` becomes a 4a edit through the style source, and the frame gets
// the kit's spacing and size scales as `tokens`. Since plan 15 a one-side padding handle writes
// that side (`padding-top`); with Alt the frame sends the axis (`padding-block`) and that is
// written.
// The frame is also told which handles the selected element cannot take (`handles`, ADR 0059), so
// it draws none of them. A handle that still writes nothing, because the server refuses it, says
// why in the properties panel (`HANDLE_NOTE`).

import type { EditOp, StyleProperty, TokenOption } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { HandleValue, ScaleStep } from '../../../channel/structure-protocol.ts';
import { inspect as readInspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { PROPERTIES, styleValueOf, tokensFor } from '../props/steps.ts';
import { text } from '../texts.ts';
import { opsForStyle, readOnlyReason } from './ops.ts';

const MAX_STEPS = 100;

/** A token's length in CSS pixels (`rem`, `em` count 16); `null` for a `%`, `calc` and so on. */
export function pxOf(css: string): number | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(css.trim());
  if (!match?.[1]) return null;
  const size = Number(match[1]);
  return match[2] === 'rem' || match[2] === 'em' ? size * 16 : size;
}

function stepsOf(tokens: readonly TokenOption[]): ScaleStep[] {
  const steps: ScaleStep[] = [];
  for (const token of tokens) {
    const px = pxOf(token.css);
    if (px === null || px < 0) continue;
    steps.push({ name: token.path.split('.').at(-1) ?? token.path, var: token.var, px });
  }
  return steps.slice(0, MAX_STEPS);
}

/** The scales the frame snaps to: spacing from the `gap` row's tokens, sizes from `width`'s. */
type Scales = { space: ScaleStep[]; size: ScaleStep[] };

export function scalesOf(tokens: readonly TokenOption[]): Scales {
  return {
    space: stepsOf(tokensFor([...tokens], 'gap')),
    size: stepsOf(tokensFor([...tokens], 'width')),
  };
}

/** The style row a handle's CSS property writes; `null` for one that is no editor row. */
export function styleOfHandle(property: string): StyleProperty | null {
  return PROPERTIES.find((row) => row === property) ?? null;
}

export type HandleWrite = { ops: EditOp[] } | { note: string };

/**
 * The ops a released handle makes, through the row's own source like the properties panel: a prop
 * source sets the prop, a class rule sets the style (a new class first). A Tailwind draft, a
 * source the panel cannot edit and a value with no place give a note key instead.
 */
export function opsForHandle(
  inspected: Inspect,
  property: string,
  value: HandleValue,
  format: 'scss' | 'tailwind',
): HandleWrite {
  if (format === 'tailwind') return { note: 'handles.readOnly' };
  const row = styleOfHandle(property);
  if (row === null) return { note: 'handles.notWritten' };
  const reason = readOnlyReason(inspected, row, format);
  if (reason) return { note: `props.reason.${reason}` };
  // `100%` and `auto` belong to the size scale; any other raw value is pixels off the kit.
  const keyword = 'raw' in value && (value.raw === '100%' || value.raw === 'auto');
  const style =
    'token' in value ? styleValueOf(`var(${value.token})`) : styleValueOf(value.raw, !keyword);
  const ops = opsForStyle(inspected, row, style, { format });
  return ops.length > 0 ? { ops } : { note: 'handles.notWritten' };
}

/** The CSS properties the frame's handles write: the size, each side's padding and the gap. */
export const HANDLE_PROPERTIES = [
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
] as const;

/** What the `handles` message says of the selected element. */
export type HandleLimits = { blocked: string[]; stepped: string[] };

/**
 * What the handles may do on the element with the source view `inspected`. `blocked`: the
 * properties a handle cannot write, whose handles the frame does not draw: every one in a
 * Tailwind draft and while the source view is not read, else the ones the properties panel shows
 * as read-only. `stepped`: the ones a kit prop covers, which have no value between two steps of
 * the scale, so their handles go from step to step.
 */
export function handleLimits(
  inspected: Inspect | null,
  format: 'scss' | 'tailwind' | null,
): HandleLimits {
  if (inspected === null || format !== 'scss') {
    return { blocked: [...HANDLE_PROPERTIES], stepped: [] };
  }
  const blocked: string[] = [];
  const stepped: string[] = [];
  for (const property of HANDLE_PROPERTIES) {
    const row = styleOfHandle(property);
    if (row === null || readOnlyReason(inspected, row, format) !== null) blocked.push(property);
    else if (inspected.styles[row]?.kind === 'prop') stepped.push(property);
  }
  return { blocked, stepped };
}

/**
 * The event a handle's note goes out on, from `main`: the properties panel shows it for the
 * element until the selection changes. `key: null` takes it away.
 */
export const HANDLE_NOTE = 'edit-handle-note';
export type HandleNote = { id: string; key: string | null };

/** The note an event carries; `null` for anything else on the event name. */
export function readHandleNote(detail: unknown): HandleNote | null {
  if (typeof detail !== 'object' || detail === null) return null;
  if (!('id' in detail) || !('key' in detail)) return null;
  const { id, key } = detail;
  if (typeof id !== 'string' || (key !== null && typeof key !== 'string')) return null;
  return { id, key };
}

export function mountHandleWrites(ctx: EditorContext): void {
  const { store, bridge, history, slug, main } = ctx;
  let chain: Promise<void> = Promise.resolve();

  function say(id: string, key: string | null): void {
    const detail: HandleNote = { id, key };
    main.dispatchEvent(new CustomEvent(HANDLE_NOTE, { detail }));
  }

  // The frame forgets both after it loads again, so they go out after every `tree` as well.
  function sendScales(): void {
    const edit = store.get().edit;
    if (edit) bridge.send({ type: 'tokens', ...scalesOf(edit.tokens) });
  }

  /** The last `handles` body sent, as text: the same one is not sent twice. */
  let sent = '';
  /** Whether handles are on, and what the selected element takes of them. */
  function sendHandles(again = false): void {
    // The store as it is now: a listener called from inside another `set` gets an older state.
    const { on, inspected, selection, edit } = store.get();
    // A source view of another element (the selection just changed) says nothing of this one.
    const view = inspected !== null && inspected.id === selection[0] ? inspected : null;
    const limits = handleLimits(view, edit?.format ?? null);
    const body = { type: 'handles' as const, on, ...limits };
    const key = JSON.stringify(body);
    if (!again && key === sent) return;
    sent = key;
    bridge.send(body);
  }

  store.subscribe((state, previous) => {
    if (state.edit !== previous.edit) sendScales();
    const changed =
      state.on !== previous.on ||
      state.inspected !== previous.inspected ||
      state.selection !== previous.selection ||
      state.edit !== previous.edit;
    if (changed) sendHandles();
  });

  function write(id: string, property: string, value: HandleValue): void {
    chain = chain
      .then(async () => {
        const edit = store.get().edit;
        if (!edit) return;
        const answer = await readInspect(slug, id);
        if (!answer.ok) return;
        const made = opsForHandle(answer.body, property, value, edit.format);
        if ('note' in made) {
          say(id, made.note);
          return;
        }
        say(id, null);
        const label = text('props.label.style', { property });
        await history.apply({ ops: made.ops, label });
      })
      .catch(() => undefined);
  }

  bridge.on((message) => {
    if (message.type === 'tree') {
      sendScales();
      sendHandles(true);
    } else if (message.type === 'handle' && message.done) {
      write(message.id, message.property, message.value);
    }
  });
}
