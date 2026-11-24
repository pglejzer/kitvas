// A handle let go in the frame, written (spec 4b, decision 12; plan 14, task D7): the frame's `handle`
// message with `done` becomes a 4a edit through the style source, and the frame gets the kit's
// spacing and size scales as `tokens`.

import type { EditOp, StyleProperty, TokenOption } from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import type { HandleValue, ScaleStep } from '../../channel/structure-protocol.ts';
import { inspect as readInspect } from './api.ts';
import type { EditorContext } from './context.ts';
import { el } from './controls.ts';
import { opsForStyle, readOnlyReason } from './props-panel.ts';
import { PROPERTIES, styleValueOf, tokensFor } from './steps.ts';
import { text } from './texts.ts';

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

/** The style row a handle's CSS property writes; one padding side has none (not an editor row). */
export function styleOfHandle(property: string): StyleProperty | 'side' | null {
  if (/^padding-(?:top|right|bottom|left)$/.test(property)) return 'side';
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
  if (row === 'side') return { note: 'handles.side' };
  if (row === null) return { note: 'handles.notWritten' };
  const reason = readOnlyReason(inspected, row, format);
  if (reason) return { note: `props.reason.${reason}` };
  // `100%` and `auto` belong to the size scale; only a Shift value is off the kit.
  const keyword = 'raw' in value && (value.raw === '100%' || value.raw === 'auto');
  const style =
    'token' in value ? styleValueOf(`var(${value.token})`) : styleValueOf(value.raw, !keyword);
  const ops = opsForStyle(inspected, row, style, { format });
  return ops.length > 0 ? { ops } : { note: 'handles.notWritten' };
}

export function mountHandleWrites(ctx: EditorContext): void {
  const { store, bridge, history, slug, panel } = ctx;
  let note: HTMLElement | null = null;
  let chain: Promise<void> = Promise.resolve();

  function say(key: string | null): void {
    const strip = panel.querySelector<HTMLElement>('[data-edit="zoom"]');
    if (!strip) return;
    if (key === null) {
      note?.remove();
      note = null;
      return;
    }
    note ??= el('p', 'zoom-note');
    note.setAttribute('role', 'status');
    note.textContent = text(key);
    strip.append(note);
  }

  // The frame forgets both after it loads again, so they go out after every `tree` as well.
  function sendScales(): void {
    const edit = store.get().edit;
    if (edit) bridge.send({ type: 'tokens', ...scalesOf(edit.tokens) });
  }
  const sendHandles = (): void => bridge.send({ type: 'handles', on: store.get().on });

  store.subscribe((state, previous) => {
    if (state.edit !== previous.edit) sendScales();
    if (state.on !== previous.on) sendHandles();
    if (state.selection[0] !== previous.selection[0]) say(null);
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
          say(made.note);
          return;
        }
        say(null);
        const label = text('props.label.style', { property });
        await history.apply({ ops: made.ops, label });
      })
      .catch(() => undefined);
  }

  bridge.on((message) => {
    if (message.type === 'tree') {
      sendScales();
      sendHandles();
    } else if (message.type === 'handle' && message.done) {
      write(message.id, message.property, message.value);
    }
  });
}
