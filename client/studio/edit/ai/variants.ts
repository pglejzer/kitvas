// Variants as panel edits (spec 4d, goal 2; plan 17, task B). Claude answers a request with one to
// three variants in a small form: per change a style value, a prop, a text or a utility class. The
// studio turns each change into ops with the properties panel's own builders (`style/ops.ts`),
// against the elements as the server describes them now, so a variant never carries a stale
// `before`. A change the panel would refuse makes the whole variant invalid, with the reason: a
// variant is applied whole or not at all. Pure: no DOM.

import type {
  EditOp,
  PropValue,
  Refusal,
  StyleContext,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type {
  Variant,
  VariantChange,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import { type CatalogProp, KIND, keywordOfProp, plainValue } from '../props/kinds.ts';
import { styleValueOf } from '../props/steps.ts';
import { isBase } from '../style/context-ops.ts';
import {
  allowedValue,
  type Format,
  MAX_OPS,
  opsForProp,
  opsForStyle,
  readOnlyReason,
} from '../style/ops.ts';
import { currentUtility, utilityFor } from '../style/utility-ops.ts';

/** Why a variant cannot be applied: the panel's own refusals, and the ones of a variant. */
export type VariantReason =
  | Refusal
  /** An element of the variant is not in the latest version now. */
  | 'gone'
  /** An element could not be read (the studio did not answer). */
  | 'unread'
  /** An element is locked (spec 4d, goal 4): Claude's variants never change it. */
  | 'locked'
  /** The property, the prop or the class cannot take the value. */
  | 'value'
  /** A text the panel would not write: empty, or with `{`, `}`, `<`, `>` or a line break. */
  | 'text'
  /** A utility class in a draft without Tailwind. */
  | 'format'
  /** A utility to swap or remove that the element does not have now. */
  | 'utility-gone'
  /** Two changes set the same thing to different values. */
  | 'twice'
  /** More ops than one edit request carries. */
  | 'too-many'
  /** A prop in a width or state context: a prop has one value for all of them. */
  | 'prop-context';

/** What the page knows of an element now: its inspect answer, or why there is none. */
export type ElementView = Inspect | 'gone' | 'unread';

/** The change of the variant that cannot be made (its index in `changes`), and why. */
export type VariantProblem = { change: number; id: string; reason: VariantReason };

export type BuiltVariant =
  /** Some of its elements are still being read. */
  | { kind: 'loading'; ids: string[] }
  | { kind: 'invalid'; ids: string[]; problem: VariantProblem }
  /** Every change is in place already: there is nothing to apply. */
  | { kind: 'same'; ids: string[] }
  | {
      kind: 'ready';
      ids: string[];
      ops: EditOp[];
      /** A text change drops a word of the element's text now: the card says "changes text". */
      dropsText: boolean;
      /** A raw value the kit has no token for is written (with the off-kit marker). */
      offKit: boolean;
    };

/** What the ops are built against: the request's context and the draft's format and tokens. */
export type VariantEnv = {
  views: ReadonlyMap<string, ElementView>;
  format: Format;
  context: StyleContext;
  tokens: readonly TokenOption[];
  locked: readonly string[];
};

/** The panel's refusal texts (`studio.edit.props.reason.*`); every other reason has its own. */
const PANEL_REASONS: ReadonlySet<string> = new Set([
  'computed',
  'spread',
  'not-found',
  'ambiguous',
  'no-text',
  'has-class',
  'no-classname',
  'utility',
  'nested',
  'invalid',
  'prop-covered',
  'kit-state-wins',
  'not-breakpoint',
  'utility-unknown',
]);

/** The text key of a reason, under `studio.edit.`. */
export const reasonKey = (reason: VariantReason): string =>
  PANEL_REASONS.has(reason) ? `props.reason.${reason}` : `ai.reason.${reason}`;

/** The elements a variant changes, in the order its changes first name them. */
export const variantIds = (variant: Pick<Variant, 'changes'>): string[] => [
  ...new Set(variant.changes.map((change) => change.id)),
];

const WORD = /[\p{L}\p{N}]+/gu;

/** The words of a text, lower case, in order. */
export const wordsOf = (text: string): string[] => text.toLocaleLowerCase().match(WORD) ?? [];

/** A word of `before` is not in `after`: the "changes text" sign (spec 4d, goal 2). */
export function dropsWords(before: string, after: string): boolean {
  const kept = new Set(wordsOf(after));
  return wordsOf(before).some((word) => !kept.has(word));
}

/**
 * A value as the panel writes it: a keyword or an image as it is (`mark: false`); for a token
 * property `var(--kit-…)` is the token, and any other raw value keeps the off-kit marker, so a
 * variant cannot write a value outside the kit without it.
 */
export function panelValue(property: StyleProperty, value: StyleValue): StyleValue {
  if (!('raw' in value)) return value;
  const kind = KIND[property];
  return kind === 'keyword' || kind === 'image' ? plainValue(value.raw) : styleValueOf(value.raw);
}

const same = (a: StyleValue, b: StyleValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A covering prop says the value already (`justify="between"` for `space-between`). */
function coveredAlready(
  view: Inspect,
  property: StyleProperty,
  prop: string,
  value: StyleValue,
): boolean {
  const written = view.props.find((one) => one.name === prop);
  const def = view.component?.props.find((one) => one.name === prop);
  if (written?.kind !== 'literal' || !def) return false;
  const held = written.value.value;
  if (KIND[property] === 'keyword') {
    return 'raw' in value && keywordOfProp(property, def, held) === value.raw;
  }
  if (typeof held !== 'string') return false;
  return 'raw' in value ? value.raw === held : value.token.endsWith(`-${held}`);
}

/**
 * The element holds the value already, where a style edit of the context would write it. The
 * builders give no ops then, as they give none for a value they cannot write; this tells which.
 */
function styleAlready(
  view: Inspect,
  property: StyleProperty,
  value: StyleValue,
  env: VariantEnv,
): boolean {
  const source = view.styles[property];
  if (source?.kind === 'prop') return coveredAlready(view, property, source.prop, value);
  if (env.format === 'tailwind') {
    const next = utilityFor(property, value, env.context, env.tokens);
    return next !== null && next === currentUtility(view, property, env.context);
  }
  const { width, state } = env.context;
  const held = isBase(env.context)
    ? view.scss?.declarations.find((one) => one.property === property)
    : (view.overrides ?? []).find(
        (one) =>
          one.utility === null &&
          one.property === property &&
          one.context.width === width &&
          one.context.state === state,
      );
  return held !== undefined && same(styleValueOf(held.value, held.offKit), value);
}

/** The ops of one change, or why the panel would not write it. */
type One = { ops: EditOp[] } | { reason: VariantReason };

type StyleChange = Extract<VariantChange, { kind: 'style' }>;
type PropChange = Extract<VariantChange, { kind: 'prop' }>;
type TextChange = Extract<VariantChange, { kind: 'text' }>;
type UtilityChange = Extract<VariantChange, { kind: 'utility' }>;

function styleOps(view: Inspect, change: StyleChange, env: VariantEnv): One {
  const { property } = change;
  const value = panelValue(property, change.value);
  const refused = readOnlyReason(view, property, env.format, env.context);
  if (refused !== null) return { reason: refused };
  if (!allowedValue(view, property, value)) return { reason: 'value' };
  const options = { format: env.format, context: env.context, tokens: env.tokens };
  const ops = opsForStyle(view, property, value, options);
  if (ops.length > 0) return { ops };
  return styleAlready(view, property, value, env) ? { ops: [] } : { reason: 'value' };
}

/** A catalog prop takes the value: its enum word, or a value of its type. */
function fitsProp(def: CatalogProp, value: PropValue): boolean {
  switch (def.type) {
    case 'enum':
      return value.kind === 'string' && (def.values ?? []).includes(value.value);
    case 'boolean':
    case 'string':
    case 'number':
      return value.kind === def.type;
    default:
      // A callback, a node or an object is written in code, never as a literal.
      return false;
  }
}

function propOps(view: Inspect, change: PropChange, env: VariantEnv): One {
  // As the panel's prop rows: read-only in a width or a state.
  if (!isBase(env.context)) return { reason: 'prop-context' };
  const written = view.props.find((one) => one.name === change.name);
  if (written?.kind === 'expr') return { reason: 'computed' };
  const def = view.component?.props.find((one) => one.name === change.name);
  if (def && !fitsProp(def, change.value)) return { reason: 'value' };
  // No ops: the prop holds the value already.
  return { ops: opsForProp(view, change.name, change.value) };
}

function textOps(view: Inspect, change: TextChange): One {
  if (view.text === null) return { reason: 'no-text' };
  // As the panel's text row: trimmed, never empty, never markup or a second line.
  const value = change.value.trim();
  if (value === '' || /[{}<>\r\n]/.test(value)) return { reason: 'text' };
  if (value === view.text) return { ops: [] };
  return { ops: [{ op: 'setText', id: view.id, value, before: view.text }] };
}

function utilityOps(view: Inspect, change: UtilityChange, env: VariantEnv): One {
  if (env.format !== 'tailwind') return { reason: 'format' };
  if (view.component && !view.component.takesClassName) return { reason: 'no-classname' };
  if (view.className?.kind === 'expr') return { reason: 'computed' };
  const classes = view.className?.kind === 'string' ? view.className.value.split(/\s+/) : [];
  const { value, before } = change;
  if (value === null && before === null) return { reason: 'value' };
  // The class to swap or remove, as the element has it now: never a stale one.
  if (before !== null && !classes.includes(before)) return { reason: 'utility-gone' };
  if (value === before || (before === null && value !== null && classes.includes(value))) {
    return { ops: [] };
  }
  return { ops: [{ op: 'setUtility', id: view.id, value, before }] };
}

function opsOfChange(view: Inspect, change: VariantChange, env: VariantEnv): One {
  switch (change.kind) {
    case 'style':
      return styleOps(view, change, env);
    case 'prop':
      return propOps(view, change, env);
    case 'text':
      return textOps(view, change);
    case 'utility':
      return utilityOps(view, change, env);
  }
}

/** What a change sets, and to what: two changes of one key with other values clash. */
function keyOf(view: Inspect, change: VariantChange, env: VariantEnv): [string, string] {
  const { width, state } = env.context;
  const where = `${width ?? ''}|${state ?? ''}`;
  switch (change.kind) {
    case 'style': {
      const value = JSON.stringify(panelValue(change.property, change.value));
      const source = view.styles[change.property];
      if (source?.kind === 'prop') return [`prop|${view.id}|${source.prop}`, value];
      if (env.format === 'tailwind') return [`style|${view.id}|${change.property}|${where}`, value];
      // Elements that share a class share its rule: one declaration for all of them.
      const rule = view.styleClass?.className ?? view.id;
      return [`style|${view.scss?.file ?? view.file}|${rule}|${change.property}|${where}`, value];
    }
    case 'prop':
      return [`prop|${view.id}|${change.name}`, JSON.stringify(change.value)];
    case 'text':
      return [`text|${view.id}`, change.value.trim()];
    case 'utility':
      return [`utility|${view.id}|${change.before ?? ''}`, change.value ?? ''];
  }
}

/** `op` adds a class that no op before it adds to that element. */
function needsClass(before: readonly EditOp[], op: EditOp): boolean {
  if (op.op !== 'addClass') return false;
  const { id, className } = op;
  return !before.some(
    (had) => had.op === 'addClass' && had.id === id && had.className === className,
  );
}

/** A raw value written with the off-kit marker, as the change list flags it. */
const isOffKitOp = (op: EditOp): boolean =>
  op.op === 'setStyle' && 'raw' in op.value && op.value.mark !== false;

/**
 * The ops of a variant against the elements now, in the order of its changes. An element still
 * being read gives `loading`; the first change the panel would refuse gives `invalid`.
 */
export function buildVariant(variant: Pick<Variant, 'changes'>, env: VariantEnv): BuiltVariant {
  const ids = variantIds(variant);
  if (ids.some((id) => !env.views.has(id))) return { kind: 'loading', ids };
  const ops: EditOp[] = [];
  const seen = new Map<string, string>();
  let dropsText = false;
  for (const [index, change] of variant.changes.entries()) {
    const fail = (reason: VariantReason): BuiltVariant => ({
      kind: 'invalid',
      ids,
      problem: { change: index, id: change.id, reason },
    });
    const view = env.views.get(change.id) ?? 'gone';
    if (view === 'gone' || view === 'unread') return fail(view);
    if (env.locked.includes(change.id)) return fail('locked');
    const one = opsOfChange(view, change, env);
    if ('reason' in one) return fail(one.reason);
    const [key, value] = keyOf(view, change, env);
    const before = seen.get(key);
    if (before !== undefined && before !== value) return fail('twice');
    seen.set(key, value);
    // The same value again (a shared rule, or a repeat): only a class the element still needs is
    // added, as `opsForAll` does; a second write of the value would find the first and conflict.
    // Another property of an element without a class: the class an earlier change of this
    // variant adds is added once (a second `addClass` is refused, `has-class`).
    const fresh = one.ops.filter((op) => op.op !== 'addClass' || needsClass(ops, op));
    ops.push(...(before === undefined ? fresh : one.ops.filter((op) => needsClass(ops, op))));
    if (change.kind === 'text' && view.text !== null && one.ops.length > 0) {
      dropsText ||= dropsWords(view.text, change.value);
    }
  }
  if (ops.length > MAX_OPS) {
    return { kind: 'invalid', ids, problem: { change: 0, id: ids[0] ?? '', reason: 'too-many' } };
  }
  if (ops.length === 0) return { kind: 'same', ids };
  return { kind: 'ready', ids, ops, dropsText, offKit: ops.some(isOffKitOp) };
}
