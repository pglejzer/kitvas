// The ops of the edit context (spec 4c, goal 1; plan 16, task A): where a property's value comes
// from at a width and state, and the ops of "Remove for this width" and "Apply to all widths".
// Pure, over the inspect answer, so the rows (task B) only call them.
//
// The cascade is mobile-first, as `min-width` and Tailwind's `md:` work: the value shown at a
// width is the one of the nearest block at or below it. A state's value wins over every resting
// one, whatever their widths, because `.a:hover` is the more specific selector.

import type { EditOp, Shorthand, StyleContext, StyleProperty } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { styleValueOf } from '../props/values/steps.ts';
import { keepsPart, opsForStyle, readOnlyReason, type StyleOptions } from './ops.ts';
import { currentUtility, isOwn, splitUtility, variantPrefix } from './utility-ops.ts';

/**
 * Where the value a property shows in `context` comes from. `here`: set in exactly this context;
 * `via`: by the shorthand of its block that holds the property (ADR 0070). `below`: inherited from
 * a smaller width's block (`width`), the base (`width: null`) or the resting state of this width.
 * `kit`: nothing in the source sets it (or a prop does, see `styles`).
 */
export type RowSource =
  | { kind: 'here'; value: string; offKit: boolean; via?: Shorthand }
  | { kind: 'below'; width: number | null; state: StyleContext['state']; value: string }
  | { kind: 'kit' };

/** The base context: all widths, resting state. */
export const BASE_CONTEXT: StyleContext = { width: null, state: null };

export const isBase = (context: StyleContext): boolean =>
  context.width === null && context.state === null;

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

const sameContext = (a: StyleContext, b: StyleContext): boolean =>
  a.width === b.width && a.state === b.state;

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

/** The value of `state` that reaches `width`: the widest block at or below it, else the base's. */
function nearest(
  entries: readonly Entry[],
  width: number | null,
  state: StyleContext['state'],
): Entry | undefined {
  const reach = entries.filter(
    (entry) =>
      entry.context.state === state &&
      (entry.context.width === null || (width !== null && entry.context.width <= width)),
  );
  return reach.sort((a, b) => (b.context.width ?? 0) - (a.context.width ?? 0))[0];
}

export function sourceAt(
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
): RowSource {
  if (inspect.styles[property]?.kind === 'prop') return { kind: 'kit' };
  const entries = entriesOf(inspect, property);
  const { width, state } = context;
  const found =
    (state === null ? undefined : nearest(entries, width, state)) ?? nearest(entries, width, null);
  if (found === undefined) return { kind: 'kit' };
  if (sameContext(found.context, context)) {
    return { kind: 'here', value: found.value, offKit: found.offKit, ...viaOf(found.via) };
  }
  return {
    kind: 'below',
    width: found.context.width,
    state: found.context.state,
    value: found.value,
  };
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
 * "Remove for this width": the ops that drop the property's value in `context`; `null` when none
 * is set there. A block left empty goes with it.
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

/**
 * "Apply to all widths": the value set in `context` becomes the base value, and every override
 * of the property in the same state goes; `null` when `context` is the base or sets nothing.
 */
export function applyToAllWidths(
  inspect: Inspect,
  property: StyleProperty,
  context: StyleContext,
  options: StyleOptions = {},
): EditOp[] | null {
  if (context.width === null) return null;
  const format = formatOf(inspect, options);
  if (readOnlyReason(inspect, property, format, context) !== null) return null;
  const wide = entriesOf(inspect, property).filter(
    (entry) => entry.context.width !== null && entry.context.state === context.state,
  );
  const here = wide.find((entry) => entry.context.width === context.width);
  if (here === undefined) return null;
  // A side a box or a pair holds at some width cannot be taken out of it (ADR 0070).
  if (wide.some((entry) => keepsPart(entry.via))) return null;
  const target: StyleContext = { width: null, state: context.state };
  // Where the value cannot be written for all widths, the overrides stay too.
  if (readOnlyReason(inspect, property, format, target) !== null) return null;
  if (format === 'tailwind') return utilitiesToBase(inspect, property, here, wide, target);

  const { id, styleClass } = inspect;
  if (!styleClass) return null;
  const { className } = styleClass;
  const value = styleValueOf(here.value, here.offKit);
  const ops = opsForStyle(inspect, property, value, { ...options, format, context: target });
  for (const entry of wide) {
    const before = styleValueOf(entry.value, entry.offKit);
    const at = { id, className, property, context: entry.context };
    ops.push({ op: 'removeStyle', ...at, before, dropRule: false, dropBlock: true });
  }
  return ops;
}
