// A style row in the edit context (spec 4c, goal 1; plan 16, task B): what it holds at the width,
// state and option value edits go to, where the value it shows comes from, and its actions,
// "Remove for this width" (or state, or option), "Apply to all widths" and "Apply to all options"
// (plan 25), each one gesture. A property a kit prop covers has one value for every width, state
// and option: a pick there asks Claude instead of writing. The sources, the targets and the ops
// are task A's (`context-ops.ts`); this file words them and wires the buttons.

import type {
  EditOp,
  StyleContext,
  StyleProperty,
  StyleValue,
} from '../../../../../src/edit/index.ts';
import type { DraftOption, OptionChoice } from '../../../../../src/shared/values/options.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import {
  applyToAllOptions,
  applyToAllWidths,
  isBase,
  type RowSource,
  removeForContext,
  sourceAt,
  targetContext,
} from '../../style/context-ops.ts';
import { optionWords } from '../../style/context-rules.ts';
import type { StyleOptions } from '../../style/ops.ts';
import { text } from '../../texts.ts';
import { el } from '../controls/controls.ts';
import type { Env } from '../groups/rows.ts';

/** The option values the page shows; none for a version without options (or in Tailwind). */
export const choiceOf = (env: Env): OptionChoice => env.options?.choice ?? {};

/**
 * Where an edit of `property` goes (C6 of plan 25): the bar's width and state, and its option;
 * with "All options" the option whose block holds the value the first element shows.
 */
export function rowContext(env: Env, property: StyleProperty): StyleContext {
  const { context } = env.state;
  return targetContext(env.inspected, property, context, choiceOf(env));
}

/** What the selected elements hold in exactly the context; `mixed` when they differ. */
export function heldAt(
  views: readonly Inspect[],
  property: StyleProperty,
  context: StyleContext,
  choice: OptionChoice = {},
): { held: string | null; offKit: boolean; mixed: boolean } {
  const here = views.map((view) => {
    const source = sourceAt(view, property, context, choice);
    return source.kind === 'here' ? source : null;
  });
  const values = new Set(here.map((one) => one?.value ?? null));
  if (values.size > 1) return { held: null, offKit: true, mixed: true };
  const [first] = here;
  return { held: first?.value ?? null, offKit: here.some((one) => one?.offKit), mixed: false };
}

type Words = { key: string; params: Record<string, string | number> };

/** Where in the rule the value is: here, or the width and state it comes from. */
function placeWords(source: RowSource, context: StyleContext): Words {
  if (source.kind === 'here') {
    // A shorthand of the context's block holds the value (ADR 0070): the row names it.
    if (source.via !== undefined) {
      return { key: 'context.source.shorthand', params: { shorthand: source.via } };
    }
    return { key: 'context.source.here', params: {} };
  }
  if (source.kind === 'kit') return { key: 'context.source.kit', params: {} };
  // The resting state of the same width: the state bar's Default.
  if (context.state !== null && source.state === null && source.width === context.width) {
    return { key: 'context.source.default', params: {} };
  }
  // The rule's own value of the same width and state, under the bar's one option value.
  if (context.option !== null && source.option === undefined && source.width === context.width) {
    return { key: 'context.source.allOptions', params: {} };
  }
  if (source.width === null) return { key: 'context.source.all', params: {} };
  return { key: 'context.source.up', params: { width: source.width } };
}

/**
 * The words of a row's source in a context other than the base: set here, or where from; a value
 * an option's block holds names the value too, "Set here · Only Theme: Dark" (plan 25).
 */
export function sourceWords(
  source: RowSource,
  context: StyleContext,
  options: readonly DraftOption[] = [],
): Words {
  const place = placeWords(source, context);
  if (source.kind === 'kit' || source.option === undefined) return place;
  const named = optionWords(options, source.option);
  const params = { source: text(place.key, place.params), ...named };
  return { key: 'context.source.option', params };
}

/** A property a kit prop sets: in a context other than the base it cannot take its own value. */
export const coveredAt = (inspected: Inspect, property: StyleProperty, context: StyleContext) =>
  !isBase(context) && inspected.styles[property]?.kind === 'prop';

/** "Remove for this …" over every selected element, as one gesture; `null` with none set. */
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
  const button = el('button', 'k-btn props-act', label);
  button.type = 'button';
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

/** The words of "Remove for this …": the width, else the state, else the option value. */
function removeWords(context: StyleContext): string {
  if (context.width !== null) return 'context.remove';
  return context.state === null ? 'context.removeOption' : 'context.removeState';
}

/** "Apply to all widths" and "Apply to all options": the ops, the button's words, its label. */
const TO_ALL = [
  { ops: applyToAllWidths, words: 'context.applyAll', label: 'context.label.all' },
  { ops: applyToAllOptions, words: 'context.applyAllOptions', label: 'context.label.allOptions' },
] as const;

/**
 * The row's actions in `context` (`rowContext`): remove its value there, or make it the value at
 * every width, or of every option.
 */
export function contextActions(
  env: Env,
  property: StyleProperty,
  key: string,
  context: StyleContext,
): HTMLElement[] {
  const options: StyleOptions = { format: env.format, tokens: env.tokens };
  const buttons: HTMLElement[] = [];
  if (removeAll(env.views, property, context, options) !== null) {
    const label = text('context.label.remove', { property });
    buttons.push(
      actionButton(text(removeWords(context)), label, () =>
        env.commit(key, (now) => removeAll(now, property, context, options) ?? [], label),
      ),
    );
  }
  const [only] = env.views;
  for (const axis of TO_ALL) {
    const toAll = (view: Inspect): EditOp[] | null => axis.ops(view, property, context, options);
    if (env.views.length !== 1 || !only || toAll(only) === null) continue;
    const label = text(axis.label, { property });
    buttons.push(
      actionButton(text(axis.words), label, () =>
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
  const op = wantedOp(env.inspected, property, value, rowContext(env, property));
  if (op === null) return;
  env.refuse({ ops: [op], label: text('props.label.style', { property }) }, reason);
}

/** The note on a row the kit's own state rule holds: a value set here would not show. */
export function heldNote(env: Env): HTMLElement {
  const state = env.state.context.state ?? 'hover';
  const name = text(`context.state.${state === 'focus-visible' ? 'focus' : state}`);
  return el('span', 'props-hint', text('context.kitState', { state: name }));
}

/**
 * Why a covered row is not written here: a prop sets it everywhere; a pick asks Claude. Plan 18f:
 * the words are every covered row's tooltip, no longer a note shown once per panel.
 */
export function coveredWords(env: Env): string {
  const canAsk = env.inspected.scss !== null && env.inspected.styleClass !== null;
  return text(canAsk ? 'context.covered.ask' : 'context.covered');
}
