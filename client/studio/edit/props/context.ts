// A style row in the edit context (spec 4c, goal 1; plan 16, task B): what it holds at the width
// and state edits go to, where the value it shows comes from, and its two actions, "Remove for
// this width" and "Apply to all widths", each one gesture. A property a kit prop covers has one
// value for every width and state: a pick there asks Claude instead of writing. The sources and
// the ops are task A's (`context-ops.ts`); this file words them and wires the buttons.

import type {
  EditOp,
  StyleContext,
  StyleProperty,
  StyleValue,
} from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import {
  applyToAllWidths,
  isBase,
  type RowSource,
  removeForContext,
  sourceAt,
} from '../style/context-ops.ts';
import type { StyleOptions } from '../style/ops.ts';
import { text } from '../texts.ts';
import { el } from './controls.ts';
import type { Env } from './rows.ts';

/** What the selected elements hold in exactly the context; `mixed` when they differ. */
export function heldAt(
  views: readonly Inspect[],
  property: StyleProperty,
  context: StyleContext,
): { held: string | null; offKit: boolean; mixed: boolean } {
  const here = views.map((view) => {
    const source = sourceAt(view, property, context);
    return source.kind === 'here' ? source : null;
  });
  const values = new Set(here.map((one) => one?.value ?? null));
  if (values.size > 1) return { held: null, offKit: true, mixed: true };
  const [first] = here;
  return { held: first?.value ?? null, offKit: here.some((one) => one?.offKit), mixed: false };
}

/** The words of a row's source in a context other than the base: set here, or where from. */
export function sourceWords(
  source: RowSource,
  context: StyleContext,
): { key: string; params: Record<string, string | number> } {
  if (source.kind === 'here') return { key: 'context.source.here', params: {} };
  if (source.kind === 'kit') return { key: 'context.source.kit', params: {} };
  // The resting state of the same width: the state bar's Default.
  if (context.state !== null && source.state === null && source.width === context.width) {
    return { key: 'context.source.default', params: {} };
  }
  if (source.width === null) return { key: 'context.source.all', params: {} };
  return { key: 'context.source.up', params: { width: source.width } };
}

/** A property a kit prop sets: in a context other than the base it cannot take its own value. */
export const coveredAt = (inspected: Inspect, property: StyleProperty, context: StyleContext) =>
  !isBase(context) && inspected.styles[property]?.kind === 'prop';

/** "Remove for this width" over every selected element, as one gesture; `null` with none set. */
export function removeAll(
  views: readonly Inspect[],
  property: StyleProperty,
  context: StyleContext,
  options: StyleOptions = {},
): EditOp[] | null {
  const ops = views.flatMap((view) => removeForContext(view, property, context, options) ?? []);
  return ops.length > 0 ? ops : null;
}

/**
 * The edit a person asked for on a covered property, for "Ask Claude": the value in the context's
 * block of the element's class rule. `null` when the element has no rule to name.
 */
export function wantedOp(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue,
  context: StyleContext,
): EditOp | null {
  const { id, scss, styleClass } = inspected;
  if (!scss || !styleClass) return null;
  return {
    op: 'setStyle',
    id,
    className: styleClass.className,
    property,
    value,
    before: null,
    newRule: !scss.rule,
    context,
    newBlock: true,
  };
}

function actionButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'props-reset', label);
  button.type = 'button';
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

/** The row's actions in a context: remove its value here, or make it the value at every width. */
export function contextActions(env: Env, property: StyleProperty, key: string): HTMLElement[] {
  const { context } = env.state;
  const options: StyleOptions = { format: env.format, tokens: env.tokens };
  const buttons: HTMLElement[] = [];
  if (removeAll(env.views, property, context, options) !== null) {
    const words = context.width === null ? 'context.removeState' : 'context.remove';
    const label = text('context.label.remove', { property });
    buttons.push(
      actionButton(text(words), label, () =>
        env.commit(key, (now) => removeAll(now, property, context, options) ?? [], label),
      ),
    );
  }
  const [only] = env.views;
  const toAll = (view: Inspect): EditOp[] | null =>
    applyToAllWidths(view, property, context, options);
  if (env.views.length === 1 && only && toAll(only) !== null) {
    const label = text('context.label.all', { property });
    buttons.push(
      actionButton(text('context.applyAll'), label, () =>
        env.commit(key, (now) => (now[0] ? (toAll(now[0]) ?? []) : []), label),
      ),
    );
  }
  return buttons;
}

/**
 * A pick on a covered property (a prop sets it everywhere) or a held one (the kit's own state rule
 * wins, ADR 0055): nothing is written; the panel offers Ask Claude with it.
 */
export function askCovered(
  env: Env,
  property: StyleProperty,
  value: StyleValue | null,
  reason: 'prop-covered' | 'kit-state-wins' = 'prop-covered',
): void {
  if (value === null) return;
  const op = wantedOp(env.inspected, property, value, env.state.context);
  if (op === null) return;
  env.refuse({ ops: [op], label: text('props.label.style', { property }) }, reason);
}

/** The note on a row the kit's own state rule holds: a value set here would not show. */
export function heldNote(env: Env): HTMLElement {
  const state = env.state.context.state ?? 'hover';
  const name = text(`context.state.${state === 'focus-visible' ? 'focus' : state}`);
  return el('span', 'props-note', text('context.kitState', { state: name }));
}

/** The notes each panel build has shown; `env` is made anew for every build of the panel. */
const shown = new WeakMap<object, Set<string>>();

/**
 * `true` the first time `key` is asked for an `env`, `false` after: a note that says the same on
 * every row shows once per panel (spec 4d, goal 8).
 */
export function noteOnce(env: object, key: string): boolean {
  const seen = shown.get(env) ?? new Set<string>();
  shown.set(env, seen);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** The note on a covered row: a prop sets it everywhere; a pick asks Claude. Once per panel. */
export function coveredNote(env: Env): HTMLElement | null {
  if (!noteOnce(env, 'covered')) return null;
  const canAsk = env.inspected.scss !== null && env.inspected.styleClass !== null;
  return el('span', 'props-note', text(canAsk ? 'context.covered.ask' : 'context.covered'));
}
