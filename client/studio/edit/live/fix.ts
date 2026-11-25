// Apply on a live finding (ADR 0061): the fix kitvas makes itself, as pure rules over the finding,
// the element's source view (`Inspect`) and the kit's tokens. A target that is too small gets a
// minimum size on its short sides, the smallest step of the kit's size scale that reaches 24 px,
// else the raw pixels. Text of too low contrast gets the kit's colour token nearest to its own
// colour (in its hue family when the kit has one) that reaches the ratio against the measured
// background. Every other finding has no fix: the card offers Ask Claude, with the words made
// here. The colour maths is `colour.ts`; the ops are the properties panel's (`style/ops.ts`).

import type { EditOp, Refusal, StyleValue, TokenOption } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { NewRequest } from '../../../../src/studio/api/requests/request-schemas.ts';
import { MAX_REQUEST_ELEMENTS, MAX_REQUEST_TEXT } from '../ai/requests.ts';
import { PROPERTIES, styleValueOf } from '../props/steps.ts';
import { type Format, opsForStyle, readOnlyReason, ruleHeld } from '../style/ops.ts';
import {
  CANVAS,
  luminance,
  MIN_TARGET,
  over,
  parseColour,
  type Rgba,
  textContrast,
} from './colour.ts';
import type { Values } from './evidence.ts';
import { LIVE_RULE_IDS } from './items.ts';

/** One style a fix sets, and how the card names its value. */
export type FixChange = {
  property: string;
  value: StyleValue;
  words: { token: string; css: string } | { raw: string };
};

/** What Apply will do for a finding, known before the element is read. */
export type FixPlan = { kind: 'target' | 'contrast'; changes: FixChange[] };

/** A finding of a kind kitvas fixes, without a plan: no colour of the kit reaches the ratio. */
export type NoPlan = { none: 'no-token'; needed: number };

/** What a live row hands the rules. */
export type FixFinding = {
  rule: string;
  source: 'frame' | 'code';
  values: Values | null;
};

/**
 * Why a plan gives no ops on this element: a refusal of the style rows (`readOnlyReason`), `set`
 * when the source holds the fix already, `none` when nothing kitvas writes can say it.
 */
export type FixReason = Refusal | 'set' | 'none';

export type FixOps = { ops: EditOp[]; everyItem: boolean } | { reason: FixReason };

/** The words of the page (`text()`), passed in so the wording is tested without a page. */
export type Words = (key: string, params?: Record<string, string | number>) => string;

function numberOf(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const read = Number(value);
  return Number.isFinite(read) ? read : null;
}

/** A length in px; `rem` counts 16 px. `null` for anything else. */
function pixels(css: string): number | null {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|rem)$/.exec(css.trim());
  if (!match?.[1]) return null;
  const size = Number(match[1]);
  return match[2] === 'rem' ? size * 16 : size;
}

/** `size.controlSm` is in the group `size`; `sizes.minHeight.sm` in `min-height`. */
const groupOf = (token: TokenOption): string =>
  (token.path.split('.').slice(0, -1).at(-1) ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

/** The kit's size scale for one axis, smallest first: its dimension tokens of a size group. */
export function sizeScale(
  tokens: readonly TokenOption[],
  axis: 'width' | 'height',
): { token: TokenOption; px: number }[] {
  const groups = ['size', 'sizes', axis, `min-${axis}`];
  return tokens
    .filter((token) => token.type === 'dimension' && groups.includes(groupOf(token)))
    .flatMap((token) => {
      const px = pixels(token.css);
      return px === null ? [] : [{ token, px }];
    })
    .sort((a, b) => a.px - b.px);
}

/** The minimum size of one axis: the smallest step that reaches `needed`, else the raw pixels. */
export function sizeChange(
  tokens: readonly TokenOption[],
  axis: 'width' | 'height',
  needed = MIN_TARGET,
): FixChange {
  const property = `min-${axis}`;
  const step = sizeScale(tokens, axis).find((one) => one.px >= needed);
  if (step === undefined) {
    const raw = `${needed}px`;
    return { property, value: { raw }, words: { raw } };
  }
  const { token } = step;
  return { property, value: { token: token.var }, words: { token: token.path, css: token.css } };
}

/**
 * The short sides of a target: each one under 24 px (a hundredth of a pixel of rounding is
 * forgiven, as the frame forgives it). When rounding hides both, the shorter side.
 */
export function targetChanges(values: Values, tokens: readonly TokenOption[]): FixChange[] | null {
  const width = numberOf(values.width);
  const height = numberOf(values.height);
  if (width === null || height === null) return null;
  const short = (side: number): boolean => side + 0.01 < MIN_TARGET;
  const axes: ('width' | 'height')[] = [];
  if (short(height)) axes.push('height');
  if (short(width)) axes.push('width');
  if (axes.length === 0) axes.push(height <= width ? 'height' : 'width');
  return axes.map((axis) => sizeChange(tokens, axis));
}

/** CIE lightness (0 to 100) of an opaque colour, from its WCAG luminance. */
function lightness(colour: Rgba): number {
  const y = luminance(colour);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

const sameColour = (a: Rgba, b: Rgba): boolean =>
  Math.abs(a.r - b.r) <= 1.5 && Math.abs(a.g - b.g) <= 1.5 && Math.abs(a.b - b.b) <= 1.5;

/**
 * A colour token's hue family: its group when the path has one of its own (`color.brand.500` is
 * `color.brand`), else the first word of its name (`color.inkMid` is `color.ink`).
 */
export function familyOf(token: TokenOption): string {
  const parts = token.path.split('.');
  if (parts.length >= 3) return parts.slice(0, -1).join('.');
  const name = parts.at(-1) ?? '';
  const word = (/^[a-z0-9]+|^[A-Z][a-z0-9]*/.exec(name)?.[0] ?? name).toLowerCase();
  return parts.length === 2 ? `${parts[0]}.${word}` : word;
}

/**
 * The kit's colour token for text of `values.color` on `values.background` that reaches
 * `values.needed`: of those that reach it, the one nearest in lightness to the present colour,
 * within its hue family when that family has one that reaches it; the first of equals. A
 * translucent token is no text colour. `null` when none reaches it; `undefined` when the values
 * are not a contrast finding's.
 */
export function contrastToken(
  values: Values,
  tokens: readonly TokenOption[],
): TokenOption | null | undefined {
  const present = parseColour(String(values.color ?? ''));
  const background = parseColour(String(values.background ?? ''));
  const needed = numberOf(values.needed);
  if (present === null || background === null || needed === null) return undefined;
  const behind = over(background, CANVAS);
  const shown = over(present, behind);
  const colours = tokens.flatMap((token) => {
    const rgba = token.type === 'color' ? parseColour(token.css) : null;
    return rgba !== null && rgba.a >= 1 ? [{ token, rgba }] : [];
  });
  const reaching = colours.filter(({ rgba }) => textContrast(rgba, behind) >= needed);
  if (reaching.length === 0) return null;
  const own = colours.find(({ rgba }) => sameColour(rgba, shown));
  const family = own === undefined ? null : familyOf(own.token);
  const kin = reaching.filter(({ token }) => family !== null && familyOf(token) === family);
  const pool = kin.length > 0 ? kin : reaching;
  const target = lightness(shown);
  const distance = (rgba: Rgba): number => Math.abs(lightness(rgba) - target);
  let best = pool[0];
  for (const one of pool) {
    if (best !== undefined && distance(one.rgba) < distance(best.rgba)) best = one;
  }
  return best?.token ?? null;
}

/**
 * What Apply will do for a finding: a plan, `NoPlan` for a contrast no token reaches, and `null`
 * for a finding of a kind kitvas does not fix (a code finding, an overflow, a mismatch).
 */
export function planFix(
  finding: FixFinding,
  tokens: readonly TokenOption[],
): FixPlan | NoPlan | null {
  if (finding.source !== 'frame' || finding.values === null) return null;
  if (finding.rule === LIVE_RULE_IDS['target-size']) {
    const changes = targetChanges(finding.values, tokens);
    return changes === null ? null : { kind: 'target', changes };
  }
  if (finding.rule !== LIVE_RULE_IDS.contrast) return null;
  const token = contrastToken(finding.values, tokens);
  if (token === undefined) return null;
  if (token === null) return { none: 'no-token', needed: numberOf(finding.values.needed) ?? 0 };
  const change: FixChange = {
    property: 'color',
    value: { token: token.var },
    words: { token: token.path, css: token.css },
  };
  return { kind: 'contrast', changes: [change] };
}

export const isPlan = (plan: FixPlan | NoPlan | null): plan is FixPlan =>
  plan !== null && 'changes' in plan;

const sameValue = (a: StyleValue, b: StyleValue): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** What the class rule holds for `property`: a declaration, or the part of a shorthand (ADR 0070). */
function ruleValue(inspected: Inspect, property: string): StyleValue | null {
  const row = PROPERTIES.find((one) => one === property);
  const own = inspected.scss?.declarations.find((one) => one.property === property);
  const held = row === undefined ? own : ruleHeld(inspected, row);
  return held ? styleValueOf(held.value, held.offKit) : null;
}

/** The class rule holds `value` for `property` already. */
function holds(inspected: Inspect, property: string, value: StyleValue): boolean {
  const before = ruleValue(inspected, property);
  return before !== null && sameValue(before, value);
}

/**
 * The ops of a property outside the editor's rows: the class rule of the section SCSS, by the
 * rules `readOnlyReason` and `opsForStyle` keep for a property no kit prop covers. A Tailwind
 * draft has no utility kitvas knows for it.
 */
function ruleOps(
  inspected: Inspect,
  property: string,
  value: StyleValue,
  format: Format,
): { ops: EditOp[] } | { reason: FixReason } {
  if (format === 'tailwind') return { reason: 'utility-unknown' };
  const { id, component, scss, styleClass, className } = inspected;
  if (component && !component.takesClassName) return { reason: 'no-classname' };
  if (!scss || !styleClass) return { reason: 'not-found' };
  if (className?.kind === 'expr' && !styleClass.exists) return { reason: 'computed' };
  const before = ruleValue(inspected, property);
  if (before === null && scss.nested.includes(property)) return { reason: 'nested' };
  if (before && sameValue(before, value)) return { ops: [] };
  const name = styleClass.className;
  const ops: EditOp[] = styleClass.exists ? [] : [{ op: 'addClass', id, className: name }];
  ops.push({ op: 'setStyle', id, className: name, property, value, before, newRule: !scss.rule });
  return { ops };
}

/** A property the properties panel has a row for goes through its rules; any other, `ruleOps`. */
function changeOps(
  inspected: Inspect,
  change: FixChange,
  options: { format: Format; tokens: readonly TokenOption[] },
): { ops: EditOp[] } | { reason: FixReason } {
  const row = PROPERTIES.find((one) => one === change.property);
  if (row === undefined) return ruleOps(inspected, change.property, change.value, options.format);
  const reason = readOnlyReason(inspected, row, options.format);
  if (reason !== null) return { reason };
  return { ops: opsForStyle(inspected, row, change.value, options) };
}

/**
 * Two changes of one element share its class: it is added once and its rule made once (the
 * second change finds the rule there), so the inverse takes each away once.
 */
function joined(ops: readonly EditOp[]): EditOp[] {
  const out: EditOp[] = [];
  const added = new Set<string>();
  const made = new Set<string>();
  for (const op of ops) {
    if (op.op === 'addClass') {
      if (added.has(op.className)) continue;
      added.add(op.className);
    }
    if (op.op === 'setStyle' && op.newRule) {
      if (made.has(op.className)) {
        out.push({ ...op, newRule: false });
        continue;
      }
      made.add(op.className);
    }
    out.push(op);
  }
  return out;
}

/**
 * The ops of a plan on the element as its source writes it, at the base (every width, the resting
 * state). A locked element, or a refusal of any change, gives the reason; a plan the source holds
 * already is `set`. `everyItem`: the element is rendered by a list, and each item takes it.
 */
export function fixOps(
  plan: FixPlan,
  inspected: Inspect,
  options: { format: Format; tokens: readonly TokenOption[]; locked: boolean },
): FixOps {
  if (options.locked) return { reason: 'locked' };
  const ops: EditOp[] = [];
  for (const change of plan.changes) {
    const one = changeOps(inspected, change, options);
    if ('reason' in one) return one;
    ops.push(...one.ops);
  }
  if (ops.length > 0) {
    const everyItem = inspected.list !== null && inspected.list !== undefined;
    return { ops: joined(ops), everyItem };
  }
  const set = plan.changes.every((change) => holds(inspected, change.property, change.value));
  return { reason: set ? 'set' : 'none' };
}

/** The gesture label of a plan, a text key under `studio.edit.`. */
export const labelKey = (plan: FixPlan): string => `live.fix.label.${plan.kind}`;

/** What the card says Apply will do: "Sets min-height to size.controlSm (32px)." */
export function says(plan: FixPlan, words: Words): string {
  const value = (change: FixChange): string =>
    'token' in change.words
      ? words('live.fix.token', { token: change.words.token, css: change.words.css })
      : change.words.raw;
  const [first, second] = plan.changes;
  if (first === undefined) return '';
  if (second === undefined) {
    return words('live.fix.setsOne', { property: first.property, value: value(first) });
  }
  return words('live.fix.setsTwo', {
    property: first.property,
    value: value(first),
    property2: second.property,
    value2: value(second),
  });
}

/** The text key of a reason the card says instead of Apply. */
export function reasonKey(reason: FixReason): string {
  if (reason === 'set') return 'live.fix.set';
  if (reason === 'none') return 'live.fix.none';
  return `props.reason.${reason}`;
}

/** What Claude is asked about a finding kitvas does not fix itself. */
export type AskFinding = {
  element: string | null;
  rule: string;
  message: string;
  /** The card widths it was seen at; none for a code finding. */
  widths: readonly number[];
  /** Why kitvas did not fix it: a reason of the fix, `no-token`, or `null` for a kind it never fixes. */
  why: FixReason | 'no-token' | null;
};

const WHY: Partial<Record<FixReason | 'no-token', string>> = {
  'no-token': 'no colour token of the kit reaches the contrast it needs',
  set: 'the source has the fix kitvas would write, and the check still finds the problem',
  none: 'nothing kitvas writes can say the fix on this element',
  locked: 'the element is locked',
};

/**
 * The `ask` request of a finding (spec 4d, goal 1): its element, and words for Claude in English,
 * as `history/ask.ts` writes them: the finding's own message, where it was seen, its rule, and why
 * the studio did not fix it. Kept within the request's text limit.
 */
export function findingRequest(finding: AskFinding): NewRequest {
  const where = finding.element === null ? '' : ` (element ${finding.element})`;
  const at = finding.widths.length === 0 ? '' : ` It was seen at ${finding.widths.join(', ')} px.`;
  const why =
    finding.why === null
      ? 'The studio does not fix this kind of finding itself.'
      : `The studio could not fix it itself: ${WHY[finding.why] ?? `the source refused it (${finding.why})`}.`;
  const head = `Please fix this live check finding in the draft source${where}: `;
  const tail = `${at} Rule: ${finding.rule}. ${why}`;
  const room = Math.max(0, MAX_REQUEST_TEXT - head.length - tail.length);
  const message =
    finding.message.length <= room
      ? finding.message
      : `${finding.message.slice(0, Math.max(0, room - 1))}…`;
  return {
    kind: 'ask',
    elements: finding.element === null ? [] : [finding.element].slice(0, MAX_REQUEST_ELEMENTS),
    context: { width: null, state: null },
    text: `${head}${message}${tail}`.slice(0, MAX_REQUEST_TEXT).trim(),
  };
}
