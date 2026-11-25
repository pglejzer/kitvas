// What a number field of the properties panel accepts and how it steps (plan 19, task T5; spec
// goal 14): an amount and a unit (px, rem, %, `auto`, or `none` for a unitless number), checked
// against the property's limits. Pure: no DOM.

/** The unit of a unitless number (a weight, a line height); it writes no suffix. */
export const NONE = 'none';
/** The unit that writes the keyword `auto` and no amount. */
export const AUTO = 'auto';

export type NumberRule = {
  /** The least amount; `null` for none (a margin may be negative). */
  min: number | null;
  max: number | null;
  /** What an arrow key adds; Shift adds ten times it. */
  step: number;
  /** The units offered, empty for a plain number. */
  units: readonly string[];
};

/** Why an amount was refused, with the limit where it has one. */
export type Reason =
  | { key: 'number' }
  | { key: 'min'; limit: number }
  | { key: 'max'; limit: number };

export type Parsed = { ok: true; css: string } | { ok: false; reason: Reason };

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const READ = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%)?$/;

/** A number without float noise: `0.1 + 0.2` shows as `0.3`. */
export const tidy = (amount: number): string => String(Math.round(amount * 1000) / 1000);

const clamp = (value: number, rule: NumberRule): number => {
  const low = rule.min === null ? value : Math.max(rule.min, value);
  return rule.max === null ? low : Math.min(rule.max, low);
};

/** The CSS for `text` in `unit`; a refusal says why. `auto` needs no amount. */
export function parseAmount(text: string, unit: string, rule: NumberRule): Parsed {
  if (unit === AUTO) return { ok: true, css: AUTO };
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) return { ok: false, reason: { key: 'number' } };
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return { ok: false, reason: { key: 'number' } };
  if (rule.min !== null && amount < rule.min) {
    return { ok: false, reason: { key: 'min', limit: rule.min } };
  }
  if (rule.max !== null && amount > rule.max) {
    return { ok: false, reason: { key: 'max', limit: rule.max } };
  }
  const suffix = rule.units.length === 0 || unit === NONE ? '' : unit;
  return { ok: true, css: `${tidy(amount)}${suffix}` };
}

/**
 * The amount one arrow key press makes: `direction` 1 or -1, `big` (Shift) ten steps. An empty or
 * unreadable amount starts from `from`. The result stays between the limits.
 */
export function stepAmount(
  text: string,
  direction: 1 | -1,
  big: boolean,
  rule: NumberRule,
  from = 0,
): string {
  const trimmed = text.trim();
  const now = NUMBER.test(trimmed) && Number.isFinite(Number(trimmed)) ? Number(trimmed) : from;
  return tidy(clamp(now + direction * rule.step * (big ? 10 : 1), rule));
}

/** A value of the source as the field shows it: the amount, the unit, and what it could not read. */
export type Shown = { amount: string; unit: string; unread: string | null };

/** `raw` read as an amount and a unit of the rule; a value it cannot read is `unread`. */
export function readAmount(raw: string | null, rule: NumberRule): Shown {
  const first = rule.units[0] ?? NONE;
  if (raw === null) return { amount: '', unit: first, unread: null };
  const text = raw.trim().toLowerCase();
  if (text === AUTO && rule.units.includes(AUTO)) return { amount: '', unit: AUTO, unread: null };
  const match = READ.exec(text);
  if (!match?.[1]) return { amount: '', unit: first, unread: raw };
  const suffix = match[2];
  if (rule.units.length === 0) {
    return suffix === undefined
      ? { amount: tidy(Number(match[1])), unit: NONE, unread: null }
      : { amount: '', unit: NONE, unread: raw };
  }
  if (suffix === undefined) {
    // A bare 0 is a length; a bare number is the unitless unit where the rule has one.
    if (rule.units.includes(NONE))
      return { amount: tidy(Number(match[1])), unit: NONE, unread: null };
    return Number(match[1]) === 0
      ? { amount: '0', unit: rule.units.includes('px') ? 'px' : first, unread: null }
      : { amount: '', unit: first, unread: raw };
  }
  if (!rule.units.includes(suffix)) return { amount: '', unit: first, unread: raw };
  return { amount: tidy(Number(match[1])), unit: suffix, unread: null };
}

/** The rule of a font weight: 1 to 1000 in steps of 100. */
export const WEIGHT_RULE: NumberRule = { min: 1, max: 1000, step: 100, units: [] };
