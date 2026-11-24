// The ops the properties panel sends (plan 13, task G; plan 15, task C): a prop at its place, a
// style at its source (a covering kit prop, or the class rule), why a row is read-only, the row a
// refusal belongs to, and one gesture over several selected elements. Pure: no DOM. The context
// menu's copy and paste of styles and the frame's handles use these too.

import type {
  EditOp,
  PropValue,
  Refusal,
  StyleProperty,
  StyleValue,
} from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import { imageOfUrl, imageUrl, KIND, keywordsOf, propValueOf } from './props-kinds.ts';
import { styleValueOf } from './steps.ts';
import type { Refused } from './store.ts';

/** Copy of `PROP_NAME` in `src/edit/domain/ops.ts`: the props the editor may write. */
export const PROP_NAME = /^(?!className$|key$|ref$|style$)[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
/** Copy of `MAX_OPS` in `src/edit/domain/ops.ts`: the ops one request may carry. */
export const MAX_OPS = 50;

export type Format = 'scss' | 'tailwind';
export type StyleOptions = { format?: Format };

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

/** The enum value a token stands for: `--kit-space-md` is `md` when the prop has `md`. */
function enumValueOf(values: string[], value: StyleValue): string | null {
  if ('raw' in value) return values.includes(value.raw) ? value.raw : null;
  const named = values.filter((name) => value.token.endsWith(`-${name}`));
  return named.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Why a style row cannot be edited by the editor, or `null` when it can (spec decisions 4, 9). */
export function readOnlyReason(
  inspected: Inspect,
  property: StyleProperty,
  format: Format,
): Refusal | null {
  const source = inspected.styles[property];
  if (format === 'tailwind' || source?.kind === 'utility') return 'utility';
  if (source?.kind === 'prop') {
    const written = inspected.props.find((prop) => prop.name === source.prop);
    if (written?.kind === 'expr') return 'computed';
    return !written && inspected.spread ? 'spread' : null;
  }
  const { component, scss, styleClass, className } = inspected;
  if (component && !component.takesClassName) return 'no-classname';
  if (!scss || !styleClass) return 'not-found';
  if (className?.kind === 'expr' && !styleClass.exists) return 'computed';
  const own = scss.declarations.some((declaration) => declaration.property === property);
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
 * The ops that set (or, with `null`, remove) a style property at its source. A prop source gives
 * one `setProp`; otherwise the class rule: `addClass` first when the element has no class yet, and
 * `newRule` when the rule does not exist. A value the property may not take gives no ops.
 */
export function opsForStyle(
  inspected: Inspect,
  property: StyleProperty,
  value: StyleValue | null,
  options: StyleOptions = {},
): EditOp[] {
  if (readOnlyReason(inspected, property, options.format ?? 'scss') !== null) return [];
  if (value !== null && !allowedValue(inspected, property, value)) return [];
  const source = inspected.styles[property];
  if (source?.kind === 'prop') {
    if (value === null) return opsForProp(inspected, source.prop, null);
    const next = coveringValue(inspected, property, source.prop, value);
    return next === null ? [] : opsForProp(inspected, source.prop, next);
  }
  const { id, scss, styleClass } = inspected;
  if (!scss || !styleClass) return [];
  const { className } = styleClass;
  const declaration = scss.declarations.find((own) => own.property === property);
  const before = declaration ? styleValueOf(declaration.value, declaration.offKit) : null;
  if (value === null) {
    return before ? [{ op: 'removeStyle', id, className, property, before, dropRule: false }] : [];
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

/** What a style row holds on an element as text: its declaration, else its covering prop. */
export function heldText(view: Inspect, property: StyleProperty): string | null {
  const source = view.styles[property];
  if (source?.kind === 'prop') {
    const written = view.props.find((prop) => prop.name === source.prop);
    return written?.kind === 'literal' ? String(written.value.value) : null;
  }
  return view.scss?.declarations.find((own) => own.property === property)?.value ?? null;
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
