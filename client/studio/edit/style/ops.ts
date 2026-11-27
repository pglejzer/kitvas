// The ops the properties panel sends (plan 13, task G; plan 15, task C): a prop at its place, a
// style at its source (a covering kit prop, or the class rule), why a row is read-only, the row a
// refusal belongs to, and one gesture over several selected elements. Pure: no DOM. The context
// menu's copy and paste of styles and the frame's handles use these too. The props the editor may
// write and the ops one request may carry are the server's (`PROP_NAME` and `MAX_OPS` of
// `src/edit/domain/op-limits.ts`, ADR 0080).

import { BASE_CONTEXT, isBaseContext, sameContext } from '../../../../src/edit/domain/op-kinds.ts';
import { PROP_NAME } from '../../../../src/edit/domain/op-limits.ts';
import type {
  EditOp,
  PropValue,
  Refusal,
  Shorthand,
  StyleContext,
  StyleProperty,
  StyleValue,
  TokenOption,
} from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { imageOfUrl, imageUrl, KIND, keywordsOf, propValueOf } from '../props/values/kinds.ts';
import { styleValueOf } from '../props/values/steps.ts';
import type { Refused } from '../store.ts';
import { opsForUtility } from './utility-ops.ts';

export { MAX_OPS, PROP_NAME } from '../../../../src/edit/domain/op-limits.ts';

export type Format = 'scss' | 'tailwind';
/**
 * `context`: the width, state and option value the edit is for (`targetContext` of
 * `context-ops.ts` over `store.context`); none is the base, and the ops are then exactly those of
 * stage 4a. `tokens`: the kit's tokens (`EditState.tokens`), which name a token's utility class
 * in a Tailwind draft; without them a token there gives no ops.
 */
export type StyleOptions = {
  format?: Format | undefined;
  context?: StyleContext | undefined;
  tokens?: readonly TokenOption[] | undefined;
};

const isBase = (context: StyleContext | undefined): boolean =>
  context === undefined || isBaseContext(context);

const sameProp = (a: PropValue, b: PropValue): boolean => a.kind === b.kind && a.value === b.value;

/** The prop written before `props[index]` that the editor may name; `null` when it is the first. */
function previousName(props: Inspect['props'], index: number): string | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const name = props[at]?.name;
    if (name && PROP_NAME.test(name)) return name;
  }
  return null;
}

/**
 * The ops that set (or, with `null`, remove) a prop. A literal keeps its place; a new prop goes
 * after the last prop written. An expression prop is read-only: no ops.
 */
export function opsForProp(inspected: Inspect, name: string, value: PropValue | null): EditOp[] {
  if (!PROP_NAME.test(name)) return [];
  const { id, props } = inspected;
  const index = props.findIndex((prop) => prop.name === name);
  const written = props[index];
  if (written?.kind === 'expr') return [];
  if (written) {
    const after = previousName(props, index);
    if (value === null) return [{ op: 'removeProp', id, name, before: written.value, after }];
    if (sameProp(written.value, value)) return [];
    return [{ op: 'setProp', id, name, value, before: written.value, after }];
  }
  if (value === null) return [];
  return [
    { op: 'setProp', id, name, value, before: null, after: previousName(props, props.length) },
  ];
}

/**
 * What the class rule's own body holds for a property (ADR 0070): the part of a shorthand written
 * after it (`via`), as the inspect answer's source says, else its own declaration.
 */
export type RuleHeld = { value: string; offKit: boolean; via?: Shorthand };

export function ruleHeld(inspected: Inspect, property: StyleProperty): RuleHeld | null {
  const source = inspected.styles[property];
  if (source?.kind === 'scss' && source.via !== undefined) {
    return { value: source.value, offKit: source.offKit, via: source.via };
  }
  const own = inspected.scss?.declarations.find((each) => each.property === property);
  return own ? { value: own.value, offKit: own.offKit } : null;
}

/**
 * The shorthands no part leaves alone: a box and a pair say every side, so a side has no reset.
 * As `withPart` with `null` answers in `src/edit/domain/style/shorthand.ts`; a test keeps them
 * equal.
 */
const WHOLE: ReadonlySet<string> = new Set([
  'padding',
  'margin',
  'padding-block',
  'padding-inline',
  'margin-block',
  'margin-inline',
]);

/** The value is held by a shorthand it cannot leave: the server would refuse to remove it. */
export const keepsPart = (via: Shorthand | undefined): boolean =>
  via !== undefined && WHOLE.has(via);

/**
 * No element could give the row's value up: on each of them a box or a pair holds it, so the row
 * offers no reset. The whole `padding` or `margin` is reset by its own row.
 */
export function heldBySides(views: readonly Inspect[], property: StyleProperty): boolean {
  return views.length > 0 && views.every((view) => keepsPart(ruleHeld(view, property)?.via));
}

/** The enum value a token stands for: `--kit-space-12` is `12` when the prop has `12`. */
function enumValueOf(values: string[], value: StyleValue): string | null {
  if ('raw' in value) return values.includes(value.raw) ? value.raw : null;
  const named = values.filter((name) => value.token.endsWith(`-${name}`));
  return named.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Why a style row cannot be edited by the editor, or `null` when it can (spec 4a decisions 4, 9;
 * spec 4c goal 1). In a context of a width or a state, a property a prop covers is `prop-covered`:
 * a prop has one value for all of them. A Tailwind draft's styles are utility classes in a
 * literal `className`, written since stage 4c.
 */
export function readOnlyReason(
  inspected: Inspect,
  property: StyleProperty,
  format: Format,
  context?: StyleContext,
): Refusal | null {
  const source = inspected.styles[property];
  const { component, scss, styleClass, className } = inspected;
  if (source?.kind === 'prop') {
    if (!isBase(context)) return 'prop-covered';
    const written = inspected.props.find((prop) => prop.name === source.prop);
    if (written?.kind === 'expr') return 'computed';
    return !written && inspected.spread ? 'spread' : null;
  }
  if (format === 'tailwind') {
    if (component && !component.takesClassName) return 'no-classname';
    if (className?.kind === 'expr') return 'computed';
    // No class names an image file of the version.
    return KIND[property] === 'image' ? 'utility-unknown' : null;
  }
  if (source?.kind === 'utility') return 'utility';
  if (component && !component.takesClassName) return 'no-classname';
  if (!scss || !styleClass) return 'not-found';
  if (className?.kind === 'expr' && !styleClass.exists) return 'computed';
  // The base cannot be written beside a block kitvas does not read; the server checks a context's.
  if (!isBase(context)) return null;
  const own = ruleHeld(inspected, property) !== null;
  return !own && scss.nested.includes(property) ? 'nested' : null;
}

/**
 * The value may be written to the property, as the server checks it: a keyword of its list and
 * an image of the version are plain (`mark: false`); a token property takes anything as in 4a.
 */
export function allowedValue(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue,
): boolean {
  const plain = 'raw' in value && value.mark === false ? value.raw : null;
  const kind = KIND[property];
  if (kind === 'keyword') return plain !== null && (keywordsOf(property) ?? []).includes(plain);
  if (kind !== 'image') return true;
  const file = plain === null ? null : imageOfUrl(plain);
  return file !== null && plain === imageUrl(file) && (inspected.images ?? []).includes(file);
}

/** The prop value a style value stands for on a covering prop: its kit word, or its enum name. */
function coveringValue(
  inspected: Inspect,
  property: StyleProperty,
  prop: string,
  value: StyleValue,
): PropValue | null {
  const def = inspected.component?.props.find((one) => one.name === prop);
  if (!def) return null;
  if (KIND[property] === 'keyword') {
    return 'raw' in value ? propValueOf(property, def, value.raw) : null;
  }
  const named = def.values ? enumValueOf(def.values, value) : null;
  return named === null ? null : { kind: 'string', value: named };
}

/**
 * The ops of a style in the class rule's block for a width or a state (spec 4c, goal 2). A new
 * value may make its block (`newBlock`): the server writes it into the block of the class's last
 * rule, which an earlier rule's block of the same context does not stand for (ADR 0067). A
 * removed one takes the block along when it was the last (`dropBlock`), so the file returns to
 * what it was.
 */
function opsInContext(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue | null,
  context: StyleContext,
): EditOp[] {
  const { id, scss, styleClass } = inspected;
  if (!scss || !styleClass) return [];
  const { className } = styleClass;
  const there = (inspected.overrides ?? []).filter(
    (each) => each.utility === null && sameContext(each.context, context),
  );
  const held = there.find((each) => each.property === property);
  const before = held ? styleValueOf(held.value, held.offKit) : null;
  const at = { id, className, property, context };
  if (value === null) {
    // A side stays in the box or the pair that holds it.
    if (before === null || keepsPart(held?.via)) return [];
    return [{ op: 'removeStyle', ...at, before, dropRule: false, dropBlock: true }];
  }
  if (before && JSON.stringify(before) === JSON.stringify(value)) return [];
  const ops: EditOp[] = styleClass.exists ? [] : [{ op: 'addClass', id, className }];
  const newBlock = before === null;
  ops.push({ op: 'setStyle', ...at, value, before, newRule: !scss.rule, newBlock });
  return ops;
}

/**
 * The ops that set (or, with `null`, remove) a style property at its source. A prop source gives
 * one `setProp`; a Tailwind draft one `setUtility`; otherwise the class rule: `addClass` first
 * when the element has no class yet, and `newRule` when the rule does not exist. With
 * `options.context` the value goes to that width and state. A value the property may not take
 * gives no ops.
 */
export function opsForStyle(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue | null,
  options: StyleOptions = {},
): EditOp[] {
  return withItemClass(inspected, styleOps(inspected, property, value, options));
}

/**
 * ADR 0072, "This item": the class rules of an item whose `className` does not give the modifier
 * yet start with `addItemClass`, once for the gesture. A write to a prop has no class rule, so it
 * stays as it is.
 */
function withItemClass(inspected: Inspect, ops: EditOp[]): EditOp[] {
  const scope = inspected.itemScope;
  if (scope === null || scope === undefined || !('className' in scope) || scope.inTsx) return ops;
  if (!ops.some((op) => op.op === 'setStyle' || op.op === 'removeStyle')) return ops;
  const add: EditOp = {
    op: 'addItemClass',
    id: inspected.id,
    path: scope.path,
    className: scope.className,
  };
  return [add, ...ops];
}

function styleOps(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue | null,
  options: StyleOptions,
): EditOp[] {
  const format = options.format ?? 'scss';
  const { context } = options;
  if (readOnlyReason(inspected, property, format, context) !== null) return [];
  if (value !== null && !allowedValue(inspected, property, value)) return [];
  const source = inspected.styles[property];
  if (source?.kind === 'prop') {
    if (value === null) return opsForProp(inspected, source.prop, null);
    const next = coveringValue(inspected, property, source.prop, value);
    return next === null ? [] : opsForProp(inspected, source.prop, next);
  }
  if (format === 'tailwind') {
    return opsForUtility(inspected, property, value, context ?? BASE_CONTEXT, options.tokens ?? []);
  }
  if (context !== undefined && !isBase(context)) {
    return opsInContext(inspected, property, value, context);
  }
  const { id, scss, styleClass } = inspected;
  if (!scss || !styleClass) return [];
  const { className } = styleClass;
  // The value as read: a declaration's, or the part of the shorthand that holds the property.
  const held = ruleHeld(inspected, property);
  const before = held ? styleValueOf(held.value, held.offKit) : null;
  if (value === null) {
    // A side stays in the box or the pair that holds it.
    if (before === null || keepsPart(held?.via)) return [];
    return [{ op: 'removeStyle', id, className, property, before, dropRule: false }];
  }
  if (before && JSON.stringify(before) === JSON.stringify(value)) return [];
  const ops: EditOp[] = styleClass.exists ? [] : [{ op: 'addClass', id, className }];
  ops.push({ op: 'setStyle', id, className, property, value, before, newRule: !scss.rule });
  return ops;
}

/**
 * One gesture over several elements: each element's ops in turn. Elements that share a class rule
 * (the same class, or the same new class) get its declaration once, and every one of them the
 * class; a second `setStyle` there would find the first one's value and conflict.
 */
export function opsForAll(
  views: readonly Inspect[],
  property: StyleProperty,
  value: StyleValue | null,
  options: StyleOptions = {},
): EditOp[] {
  const ops: EditOp[] = [];
  const ruled = new Set<string>();
  for (const view of views) {
    for (const op of opsForStyle(view, property, value, options)) {
      if (op.op === 'setStyle' || op.op === 'removeStyle') {
        const key = `${view.scss?.file ?? ''}|${op.className}|${op.property}`;
        if (ruled.has(key)) continue;
        ruled.add(key);
      }
      ops.push(op);
    }
  }
  return ops;
}

/** One prop on several elements, as one gesture. */
export const opsForPropAll = (
  views: readonly Inspect[],
  name: string,
  value: PropValue | null,
): EditOp[] => views.flatMap((view) => opsForProp(view, name, value));

/** The rows every element can take: read-only on none of them. */
export function sharedProperties(
  views: readonly Inspect[],
  properties: readonly StyleProperty[],
  format: Format,
): StyleProperty[] {
  return properties.filter((property) =>
    views.every((view) => readOnlyReason(view, property, format) === null),
  );
}

/**
 * What a style row holds on an element as text: its declaration or the part of a shorthand that
 * holds it, else its covering prop.
 */
export function heldText(view: Inspect, property: StyleProperty): string | null {
  const source = view.styles[property];
  if (source?.kind === 'prop') {
    const written = view.props.find((prop) => prop.name === source.prop);
    return written?.kind === 'literal' ? String(written.value.value) : null;
  }
  return ruleHeld(view, property)?.value ?? null;
}

/** The text every element holds for the row (`null`: none holds one), or `mixed`. */
export function sharedText(
  views: readonly Inspect[],
  property: StyleProperty,
): { text: string | null } | 'mixed' {
  const texts = new Set(views.map((view) => heldText(view, property)));
  if (texts.size > 1) return 'mixed';
  return { text: [...texts][0] ?? null };
}

/** The row a refused op belongs to, as the rows key it. */
export function refusalKey(refused: Refused): string | null {
  const op = refused.gesture.ops[refused.index];
  if (!op) return null;
  if (op.op === 'setProp' || op.op === 'removeProp') return `prop:${op.name}`;
  if (op.op === 'setText') return 'text';
  if (op.op === 'setStyle' || op.op === 'removeStyle') return `style:${op.property}`;
  const style = refused.gesture.ops.find(
    (one) => one.op === 'setStyle' || one.op === 'removeStyle',
  );
  return style && 'property' in style ? `style:${style.property}` : null;
}
