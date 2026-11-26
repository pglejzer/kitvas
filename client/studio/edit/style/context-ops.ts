// The ops of the edit context (spec 4c, goal 1; plan 16, task A; ADR 0082): where a property's
// value comes from at a width, a state and the option values the page shows, where an edit of it
// goes, and the ops of "Remove for this width", "Apply to all widths" and "Apply to all options".
// Pure, over the inspect answer, so the rows (task B) only call them.
//
// What shows (C6 of plan 25): a state's value before a resting one, because `.a:hover` is the
// more specific selector; among those, the last block of a shown option value that sets it
// before the rule's own, as `[data-opt-x="y"] .a` is more specific too; then, mobile-first as
// `min-width` and Tailwind's `md:` work, the nearest width at or below. An edit goes to the card's
// width and the bar's state; with the bar on "All options" to the option's block the shown value
// comes from (none for the rule's own), else to the one value the bar names.

import { BASE_CONTEXT, sameContext, sameOption } from '../../../../src/edit/domain/op-kinds.ts';
import type {
  ContextOption,
  EditOp,
  Shorthand,
  StyleContext,
  StyleProperty,
} from '../../../../src/edit/index.ts';
import type { OptionChoice } from '../../../../src/shared/values/options.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { styleValueOf } from '../props/values/steps.ts';
import { keepsPart, opsForStyle, readOnlyReason, type StyleOptions } from './ops.ts';
import { currentUtility, isOwn, splitUtility, variantPrefix } from './utility-ops.ts';

/**
 * Where the value a property shows in `context` comes from. `here`: set in exactly the block an
 * edit goes to; `via`: by the shorthand of its block that holds the property (ADR 0070). `below`:
 * inherited from a smaller width's block (`width`), the base (`width: null`) or the resting state
 * of this width. `option`: the option's value whose block holds it (ADR 0082). `kit`: nothing in
 * the source sets it (or a prop does, see `styles`).
 */
export type RowSource =
  | { kind: 'here'; value: string; offKit: boolean; via?: Shorthand; option?: ContextOption }
  | {
      kind: 'below';
      width: number | null;
      state: StyleContext['state'];
      value: string;
      option?: ContextOption;
    }
  | { kind: 'kit' };

/** The base context (all widths, resting state, every option), and whether a context is it. */
export {
  BASE_CONTEXT,
  isBaseContext as isBase,
} from '../../../../src/edit/domain/op-kinds.ts';

type Entry = {
  context: StyleContext;
  value: string;
  offKit: boolean;
  utility: string | null;
  via?: Shorthand;
};

/** `via` as a key only where a shorthand holds the value. */
const viaOf = (via: Shorthand | undefined): { via?: Shorthand } =>
  via === undefined ? {} : { via };

/** `option` as a key only where an option's block holds the value. */
const optionOf = (option: ContextOption | null): { option?: ContextOption } =>
  option === null ? {} : { option };

/** A block of the rule's own, or of an option's value the page shows now. */
const shows = (option: ContextOption | null, choice: OptionChoice): boolean =>
  option === null || choice[option.id] === option.value;

/** Every place the source sets the property: the base, then each width's and state's value. */
function entriesOf(inspect: Inspect, property: StyleProperty): Entry[] {
  const entries: Entry[] = [];
  const base = inspect.styles[property];
  if (base?.kind === 'scss') {
    const { value, offKit } = base;
    entries.push({ context: BASE_CONTEXT, value, offKit, utility: null, ...viaOf(base.via) });
  } else if (base?.kind === 'utility') {
    // The base of a Tailwind draft is known by its class only.
    const { className } = base;
    entries.push({ context: BASE_CONTEXT, value: className, offKit: false, utility: className });
  }
  for (const each of inspect.overrides ?? []) {
    if (each.property !== property) continue;
    const { context, value, offKit, utility } = each;
    entries.push({ context, value, offKit, utility, ...viaOf(each.via) });
  }
  return entries;
}

/**
 * The value of `state` that reaches `width` with `choice` shown: of the blocks that reach it, the
 * ones of the shown option value whose block sets it last, else the rule's own; of those the widest
 * at or below the width, else the one of every width.
 */
function shownAt(
  entries: readonly Entry[],
  width: number | null,
  state: StyleContext['state'],
  choice: OptionChoice,
): Entry | undefined {
  const reach = entries.filter(
    (entry) =>
      entry.context.state === state &&
      shows(entry.context.option, choice) &&
      (entry.context.width === null || (width !== null && entry.context.width <= width)),
  );
  const last = reach.filter((entry) => entry.context.option !== null).at(-1)?.context.option;
  const tier = reach.filter((entry) => sameOption(entry.context.option, last ?? null));
  return tier.sort((a, b) => (b.context.width ?? 0) - (a.context.width ?? 0))[0];
}

/**
 * Where the value of `property` the page shows in `context` comes from; `choice`: the option
 * values shown (none: no option's block applies). `here`: in the block an edit goes to
 * (`targetContext`).
 */
export function sourceAt(
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  choice: OptionChoice = {},
): RowSource {
  if (inspect.styles[property]?.kind === 'prop') return { kind: 'kit' };
  const entries = entriesOf(inspect, property);
  const { width, state } = context;
  const found =
    (state === null ? undefined : shownAt(entries, width, state, choice)) ??
    shownAt(entries, width, null, choice);
  if (found === undefined) return { kind: 'kit' };
  const { option } = found.context;
  const target = context.option === null ? { ...context, option } : context;
  if (sameContext(found.context, target)) {
    const { value, offKit } = found;
    return { kind: 'here', value, offKit, ...viaOf(found.via), ...optionOf(option) };
  }
  return {
    kind: 'below',
    width: found.context.width,
    state: found.context.state,
    value: found.value,
    ...optionOf(option),
  };
}

/**
 * Where an edit of `property` goes in `context` with `choice` shown: the context's width and state,
 * and its option; with none ("All options") the option whose block the shown value comes from, so
 * a value one option sets changes only there, and every other one for every option.
 */
export function targetContext(
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  choice: OptionChoice = {},
): StyleContext {
  if (context.option !== null) return context;
  const source = sourceAt(inspect, property, context, choice);
  return source.kind === 'kit' || source.option === undefined
    ? context
    : { ...context, option: source.option };
}

/** The draft's format when the caller does not say: a Tailwind draft's values name their class. */
function formatOf(inspect: Inspect, options: StyleOptions): 'scss' | 'tailwind' {
  if (options.format !== undefined) return options.format;
  const utilities =
    (inspect.overrides ?? []).some((each) => each.utility !== null) ||
    Object.values(inspect.styles).some((source) => source?.kind === 'utility');
  return utilities ? 'tailwind' : 'scss';
}

/**
 * "Remove for this width" (or this state, or this option): the ops that drop the property's value
 * in `context`, the block an edit goes to; `null` when none is set there. A block left empty goes
 * with it.
 */
export function removeForContext(
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  options: StyleOptions = {},
): EditOp[] | null {
  const format = formatOf(inspect, options);
  const ops = opsForStyle(inspect, property, null, { ...options, format, context });
  return ops.length > 0 ? ops : null;
}

/** The Tailwind ops of "Apply to all widths": the class without its screen, the others out. */
function utilitiesToBase(
  inspect: Inspect,
  property: StyleProperty,
  here: Entry,
  others: readonly Entry[],
  target: StyleContext,
): EditOp[] | null {
  const { id } = inspect;
  if (here.utility === null || !isOwn(property, here.utility)) return null;
  const value = `${variantPrefix(target)}${splitUtility(here.utility).base}`;
  const current = currentUtility(inspect, property, target);
  const before = current !== null && isOwn(property, current) ? current : null;
  const ops: EditOp[] = current === value ? [] : [{ op: 'setUtility', id, value, before }];
  for (const { utility } of others) {
    if (utility === null || !isOwn(property, utility)) continue;
    ops.push({ op: 'setUtility', id, value: null, before: utility });
  }
  return ops;
}

/** What "Apply to all" makes one value for: every width, or every option (ADR 0082). */
type Axis = 'width' | 'option';

/**
 * The values "Apply to all" takes away along `axis`, `context`'s among them: of the same state,
 * every width of the same option, or every option at the same width. `null` for the options when
 * an option's block of a narrower width reaches this one: it would still win there.
 */
function alongAxis(entries: readonly Entry[], context: StyleContext, axis: Axis): Entry[] | null {
  const state = entries.filter((entry) => entry.context.state === context.state);
  if (axis === 'width') {
    return state.filter(
      (entry) => entry.context.width !== null && sameOption(entry.context.option, context.option),
    );
  }
  const options = state.filter((entry) => entry.context.option !== null);
  const { width } = context;
  const narrower = options.some(
    (entry) =>
      entry.context.width !== width &&
      (entry.context.width === null || (width !== null && entry.context.width < width)),
  );
  return narrower ? null : options.filter((entry) => entry.context.width === width);
}

/**
 * "Apply to all widths" or "Apply to all options": the value set in `context` becomes the value of
 * every width (of its option) or of every option (at its width), and the other values along that
 * axis go; `null` when `context` has no width or no option, or sets nothing.
 */
function applyToAll(
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  axis: Axis,
  options: StyleOptions,
): EditOp[] | null {
  if ((axis === 'width' ? context.width : context.option) === null) return null;
  const format = formatOf(inspect, options);
  if (readOnlyReason(inspect, property, format, context) !== null) return null;
  const others = alongAxis(entriesOf(inspect, property), context, axis);
  const here = others?.find((entry) => sameContext(entry.context, context));
  if (others === null || here === undefined) return null;
  // A side a box or a pair holds at some width cannot be taken out of it (ADR 0070).
  if (others.some((entry) => keepsPart(entry.via))) return null;
  const target: StyleContext =
    axis === 'width' ? { ...context, width: null } : { ...context, option: null };
  // Where the value cannot be written for all of them, the overrides stay too.
  if (readOnlyReason(inspect, property, format, target) !== null) return null;
  if (format === 'tailwind') {
    // A Tailwind draft's options act through the prop only (plan 25).
    return axis === 'width' ? utilitiesToBase(inspect, property, here, others, target) : null;
  }

  const { id, styleClass } = inspect;
  if (!styleClass) return null;
  const { className } = styleClass;
  const value = styleValueOf(here.value, here.offKit);
  const ops = opsForStyle(inspect, property, value, { ...options, format, context: target });
  for (const entry of others) {
    const before = styleValueOf(entry.value, entry.offKit);
    const at = { id, className, property, context: entry.context };
    ops.push({ op: 'removeStyle', ...at, before, dropRule: false, dropBlock: true });
  }
  return ops;
}

/** "Apply to all widths": `context`'s value for every width of its state and option. */
export const applyToAllWidths = (
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  options: StyleOptions = {},
): EditOp[] | null => applyToAll(inspect, property, context, 'width', options);

/** "Apply to all options": `context`'s value for every option at its width and state. */
export const applyToAllOptions = (
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  options: StyleOptions = {},
): EditOp[] | null => applyToAll(inspect, property, context, 'option', options);
