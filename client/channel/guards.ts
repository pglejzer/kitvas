// The small guards the channel's protocols share: an element id, a bounded text, a count and a
// list item's place. Each protocol checks every message with them on both sides.

import { isRecord } from '../../src/shared/values/guards.ts';

/** The message, when it is an object of this channel (`kitvas: 1` and the channel's name). */
export function ours(data: unknown, channel: string): Record<string, unknown> | undefined {
  return isRecord(data) && data.kitvas === 1 && data.channel === channel ? data : undefined;
}

/** An element id as the frame writes it (`data-kv-id`): letters, digits and `_ . : / $ -`. */
const ELEMENT_ID = /^[A-Za-z0-9_.:/$-]{1,200}$/;

export const isId = (value: unknown): value is string =>
  typeof value === 'string' && ELEMENT_ID.test(value);

/** A text of at most `max` characters; an empty one passes. */
export const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

/** A request number or a count: a whole number from 0 to a billion. */
export const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e9;

/** A guard for a list item's place: a whole number from 0 to `max`. */
export const itemUpTo =
  (max: number) =>
  (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
