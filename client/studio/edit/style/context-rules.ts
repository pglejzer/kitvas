// The rules of the edit context (spec 4c, goals 1 and 3; plan 16, task B), pure so they are tested
// without a DOM: the width an edit applies from, given the card it is made in and the kit's
// breakpoints; which cards show a preview; the state bar, whose states force the same state on
// the selected elements in every card; and the bar's option values (plan 25): "All options", or
// one value the page shows that differs from its default.

import { sameOption } from '../../../../src/edit/domain/op-kinds.ts';
import type { ContextOption, StyleContext, StyleState } from '../../../../src/edit/index.ts';
import {
  type DraftOption,
  type OptionChoice,
  offDefault,
} from '../../../../src/shared/values/options.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { ForceState, LiveStudioBody } from '../../../channel/live-protocol.ts';
import { PRESETS } from '../../canvas/width.ts';

/** The breakpoints when the kit names none: the studio's two wider presets. */
export const DEFAULT_BREAKPOINTS: readonly number[] = [768, 1280];

/** The base width: a card this wide or narrower edits every width. */
export const BASE_WIDTH: number = PRESETS[0] ?? 390;

/** The kit's breakpoints, ascending, as the inspect answer names them; the defaults without. */
export function breakpointsOf(inspected: Pick<Inspect, 'breakpoints'> | null): number[] {
  const named = (inspected?.breakpoints ?? []).filter((width) => Number.isInteger(width));
  const list = named.length > 0 ? named : [...DEFAULT_BREAKPOINTS];
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * The width an edit in a card `cardWidth` wide applies from (mobile-first, spec decision A): the
 * largest breakpoint at or below it; `null`, every width, at the base width or below the first.
 */
export function contextWidthOf(cardWidth: number, breakpoints: readonly number[]): number | null {
  if (!(cardWidth > BASE_WIDTH)) return null;
  let found: number | null = null;
  for (const breakpoint of breakpoints) {
    if (breakpoint <= cardWidth && (found === null || breakpoint > found)) found = breakpoint;
  }
  return found;
}

/** Whether a preview made for `contextWidth` shows in a card `cardWidth` wide: from that width up. */
export const previewApplies = (cardWidth: number, contextWidth: number | null): boolean =>
  contextWidth === null || cardWidth >= contextWidth;

/** The state bar's buttons, in order; `null` is Default, the resting state. */
export const BAR_STATES: readonly (StyleState | null)[] = [
  null,
  'hover',
  'focus-visible',
  'active',
];

/** What the frames force for a state of the bar: Focus forces `:focus` and `:focus-visible`. */
export function forceOf(state: StyleState | null): ForceState | null {
  if (state === 'focus-visible') return 'focus';
  return state;
}

/** The bar's word for a state: `default`, `hover`, `focus` or `active` (the text key's end). */
export const stateName = (state: StyleState | null): string => forceOf(state) ?? 'default';

/** The message that forces `state` on `ids` in a card; the resting state forces nothing. */
export function forceBody(ids: readonly string[], state: StyleState | null): LiveStudioBody {
  const force = forceOf(state);
  return force === null || ids.length === 0
    ? { type: 'force', ids: [], state: null }
    : { type: 'force', ids: [...ids], state: force };
}

/** The line that says where edits go: "All widths", or "768 and up". */
export function widthWords(width: number | null): { key: string; params: Record<string, number> } {
  return width === null
    ? { key: 'context.width.all', params: {} }
    : { key: 'context.width.up', params: { width } };
}

/**
 * The bar's option once the page shows other values: kept while it is a value shown that differs
 * from its default (the bar's targets after "All options", `offDefault`), else "All options"
 * (`null`), so an edit never goes to a value that is not shown.
 */
export function keptOption(
  option: ContextOption | null,
  options: readonly DraftOption[],
  choice: OptionChoice,
): ContextOption | null {
  if (option === null) return null;
  return offDefault(options, choice).some((one) => sameOption(one, option)) ? option : null;
}

/** The labels of an option's value, as the options row says them; the ids for one not known. */
export function optionWords(
  options: readonly DraftOption[],
  option: ContextOption,
): { option: string; value: string } {
  const found = options.find((one) => one.id === option.id);
  const value = found?.values.find((one) => one.id === option.value);
  return { option: found?.label ?? option.id, value: value?.label ?? option.value };
}

/** The bar's key of a target: `columns=2`, and `''` for "All options". */
export const optionKey = (option: ContextOption | null): string =>
  option === null ? '' : `${option.id}=${option.value}`;

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

type Seen = { on: boolean; selection: readonly string[]; context: StyleContext };

/**
 * The context after another selection or leaving Edit: the state rests (spec 4c, goal 3), so a
 * forced state never outlives what it was forced on. `null` when nothing changes.
 */
export function restContext(state: Seen, previous: Seen): StyleContext | null {
  if (state.context.state === null) return null;
  const left = previous.on && !state.on;
  const other = !sameIds(state.selection, previous.selection);
  return left || other ? { ...state.context, state: null } : null;
}
