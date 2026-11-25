// Style operations with a width or a state (spec 4c, goal 2): the declaration lives in a block
// nested in the element's class rule. `@media (min-width: Npx)` blocks stand after the rule's own
// declarations in ascending width, then `&:hover`, `&:focus-visible` and `&:active`; a state at a
// width is that state's block inside the width's block. A block that an operation creates
// (`newBlock`) is taken away by its inverse (`dropBlock`) byte for byte, and so is a rule. A class
// with several rules (ADR 0067) is read in file order: a value is written where its last
// declaration is, and a new one goes into the class's last rule. A shorthand of a block answers
// for the properties it holds as one of the rule's own body does (ADR 0070).

import { STYLE_STATES, type StyleContext } from '../ops.ts';
import { type ApplyResult, isStyleProperty, type StyleProperty } from '../types.ts';
import { type Body, indentAt, type Nest } from './scss-reader.ts';
import { classRules, type Found } from './scss-rules.ts';
import {
  addDeclaration,
  blockCut,
  declarationCut,
  declarationText,
  dropEmptyRule,
  emptyBody,
  insertNested,
  newRule,
  replaceValue,
  type ScssOp,
  type ScssOptions,
  splice,
} from './scss-write.ts';
import { heldBy, isShorthand, type Shorthand, type VarKind } from './shorthand.ts';
import { answerFor, type Said, untyped } from './shorthand-source.ts';
import { type Beside, heldIn, holdsHeld, setBeside, withoutPart } from './shorthand-write.ts';

const conflict = (): ApplyResult => ({ conflict: 'changed' });
const widthOnly = (context: StyleContext): StyleContext => ({ width: context.width, state: null });

/** The preludes of the blocks a context is written in, the outer one first. */
function preludesOf(context: StyleContext): string[] {
  const media = context.width === null ? [] : [`@media (min-width: ${context.width}px)`];
  return context.state === null ? media : [...media, `&:${context.state}`];
}

/** The one block of `context` right inside `body`; `undefined` without one. */
function blockIn(body: Body, context: StyleContext): Nest | undefined | 'ambiguous' {
  const hits = body.blocks.filter(
    (block) => block.context.width === context.width && block.context.state === context.state,
  );
  return hits.length > 1 ? 'ambiguous' : hits[0];
}

/**
 * Where a context's block is, or would go. `parent`: the body it is or goes in (the rule, or the
 * width's block for a state at a width that has one), with the indent of that body's first line.
 * `missing`: the blocks to create when `target` is not there, the outer one first.
 */
type Place = {
  parent: Body;
  outer: string;
  target: Nest | undefined;
  missing: StyleContext[];
};

function placeOf(text: string, rule: Found, context: StyleContext): Place | 'ambiguous' | 'open' {
  if (context.width === null || context.state === null) {
    const target = blockIn(rule, context);
    if (target === 'ambiguous') return target;
    return { parent: rule, outer: rule.outer, target, missing: [context] };
  }
  const media = blockIn(rule, widthOnly(context));
  if (media === 'ambiguous') return media;
  if (media === undefined) {
    const missing = [widthOnly(context), context];
    return { parent: rule, outer: rule.outer, target: undefined, missing };
  }
  if (!media.closed) return 'open';
  const target = blockIn(media, context);
  if (target === 'ambiguous') return target;
  return { parent: media, outer: indentAt(text, media.span.start), target, missing: [context] };
}

/**
 * The start of the block a new one of `context` stands before in `body`, or the body's closing
 * brace: widths ascend and come before every state; states keep the order of `STYLE_STATES`.
 */
function nextOf(body: Body, context: StyleContext): number {
  const order = (block: Nest): number =>
    block.context.state === null ? -1 : STYLE_STATES.indexOf(block.context.state);
  const mine = context.state === null ? -1 : STYLE_STATES.indexOf(context.state);
  const later = body.blocks.find((block) =>
    context.state === null
      ? block.context.state !== null || (block.context.width ?? 0) > (context.width ?? 0)
      : order(block) > mine,
  );
  return later?.span.start ?? body.close;
}

/** The missing blocks of a place with the declaration inside, in their place of the parent. */
function insertBlocks(text: string, place: Place, declaration: string): ApplyResult {
  const { parent, missing } = place;
  const first = missing[0];
  if (first === undefined) return { refused: 'invalid' };
  const preludes = preludesOf(missing.at(-1) ?? first).slice(-missing.length);
  return insertNested(text, parent, place.outer, nextOf(parent, first), preludes, declaration);
}

/**
 * Another rule of the class than `home` sets the property in a block of the same state at a wider
 * width. A new value in `home`, the class's last rule, would come after that block in the cascade
 * and win over it where the wider width should: which value shows is not kitvas's to guess.
 */
function outranked(
  rules: readonly Found[],
  home: Found,
  property: string,
  context: StyleContext,
): boolean {
  const wider = (block: Nest): boolean =>
    block.context.state === context.state &&
    (block.context.width ?? 0) > (context.width ?? 0) &&
    block.own.some((own) => own.view.property === property);
  const any = (blocks: readonly Nest[]): boolean =>
    blocks.some((block) => wider(block) || any(block.blocks));
  return rules.some((rule) => rule !== home && any(rule.blocks));
}

/**
 * The text without the context's block of the class's rule number `index` when the block is
 * empty, and then without the width's block around a state's when that is empty too: what
 * `insertBlocks` put in, or less.
 */
function dropEmptyBlocks(
  text: string,
  className: string,
  context: StyleContext,
  index: number,
): string {
  let next = text;
  const both = context.width !== null && context.state !== null;
  for (const each of both ? [context, widthOnly(context)] : [context]) {
    const rule = classRules(next, className)[index];
    const place = rule === undefined || !rule.closed ? 'open' : placeOf(next, rule, each);
    if (typeof place === 'string' || place.target === undefined) return next;
    if (!emptyBody(next, place.target)) return next;
    const cut = blockCut(next, place.parent, place.target);
    next = splice(next, cut.start, cut.end, '');
  }
  return next;
}

/** A declaration that is not there yet: in the context's block of the class's last rule. */
function addInContext(
  text: string,
  op: ScssOp,
  context: StyleContext,
  options: ScssOptions,
  rules: readonly Found[],
  home: { rule: Found; place: Place },
): ApplyResult {
  // Nothing to remove, and no value the person could have seen there.
  if (op.op === 'removeStyle') return options.force ? { refused: 'not-found' } : conflict();
  if (op.before !== null && !options.force) return conflict();
  if (outranked(rules, home.rule, op.property, context)) return { refused: 'ambiguous' };
  const declaration = declarationText(op.property, op.value);
  const { target } = home.place;
  if (target === undefined) {
    if (op.newBlock !== true && !options.force) return { refused: 'not-found' };
    return insertBlocks(text, home.place, declaration);
  }
  if (!target.closed) return { refused: 'invalid' };
  return addDeclaration(text, target, indentAt(text, target.span.start), declaration);
}

/**
 * A value where a shorthand of the context's block stands last without holding the property: no
 * value the person could have seen is there, so a new one goes into that shorthand, or right
 * after it when it does not split (ADR 0070).
 */
function besideInContext(
  text: string,
  op: ScssOp,
  options: ScssOptions,
  after: Beside<Nest>,
): ApplyResult {
  if (op.op === 'removeStyle') return options.force ? { refused: 'not-found' } : conflict();
  if (op.before !== null && !options.force) return conflict();
  if (!after.body.closed) return { refused: 'invalid' };
  const outer = indentAt(text, after.body.span.start);
  return setBeside(text, after, outer, op, options.varKind ?? untyped);
}

/** Applies a style operation whose context is a width, a state or both. */
export function applyScssContext(
  text: string,
  op: ScssOp,
  context: StyleContext,
  options: ScssOptions,
): ApplyResult {
  const { width } = context;
  if (width !== null && options.breakpoints !== undefined) {
    if (!options.breakpoints().includes(width)) return { refused: 'not-breakpoint' };
  }
  const rules = classRules(text, op.className);
  const last = rules.at(-1);
  if (last === undefined) {
    if (op.op !== 'setStyle' || !op.newRule) return { refused: 'not-found' };
    if (op.before !== null && !options.force) return { refused: 'not-found' };
    return newRule(text, op.className, preludesOf(context), declarationText(op.property, op.value));
  }
  if (rules.some((rule) => !rule.closed)) return { refused: 'invalid' };
  const places: Place[] = [];
  for (const rule of rules) {
    const place = placeOf(text, rule, context);
    if (place === 'ambiguous') return { refused: 'ambiguous' };
    if (place === 'open') return { refused: 'invalid' };
    places.push(place);
  }
  const targets = places.flatMap((place) => (place.target === undefined ? [] : [place.target]));
  const kindOf = options.varKind ?? untyped;
  const held = heldIn(targets, op.property, kindOf);
  if (held === 'ambiguous') return { refused: 'ambiguous' };
  if (held.kind === 'none') {
    const nested = targets.some((target) => target.nested.includes(op.property));
    if (nested) return { refused: 'nested' };
    if (held.after !== null) return besideInContext(text, op, options, held.after);
    const home = places.at(-1);
    if (home === undefined) return { refused: 'invalid' };
    return addInContext(text, op, context, options, rules, { rule: last, place: home });
  }
  // The property's own declaration, or the shorthand of the block that holds it (ADR 0070).
  const found = held.own;
  // The rule whose block holds the declaration: an emptied block goes from that rule.
  const index = places.findIndex((each) => each.target?.own.includes(found) === true);
  if (places[index]?.target?.closed !== true) return { refused: 'invalid' };
  if (!options.force && !holdsHeld(held, op.before)) return conflict();

  if (op.op === 'setStyle') {
    return held.kind === 'own'
      ? replaceValue(text, found, op.value)
      : setBeside(text, held, indentAt(text, held.body.span.start), op, kindOf);
  }
  if (held.kind === 'part') {
    const without = withoutPart(text, held, op.property, kindOf);
    if (without !== 'last') return without;
  }
  const cut = declarationCut(text, found.view.span);
  let next = splice(text, cut.start, cut.end, '');
  if (op.dropBlock === true) next = dropEmptyBlocks(next, op.className, context, index);
  const result: ApplyResult = { text: next, changed: [{ start: cut.start, end: cut.start }] };
  return (op.dropRule ? dropEmptyRule(next, op.className) : null) ?? result;
}

/**
 * A value the rule sets for a width or a state: one declaration of one of its context blocks, or
 * the part of a shorthand there that holds the property (`via`, ADR 0070).
 */
export type ScssOverride = {
  context: StyleContext;
  property: StyleProperty;
  value: string;
  offKit: boolean;
  via?: Shorthand;
};

/**
 * Every value the rules of `.className` set in a context block, for the properties of the
 * editor's set: for each context and property the last declaration in file order, which is the
 * one the browser applies, or the part of a shorthand written after it that holds the property;
 * in the order they first appear, a shorthand's parts where the shorthand stands. None when the
 * text has no such rule. `kindOf`: what types a `var(--kit-…)` in a `border`, an `outline` or a
 * `background`; without it such a shorthand does not split.
 */
export function scssOverrides(
  text: string,
  className: string,
  kindOf: VarKind = untyped,
): ScssOverride[] {
  /** The declarations of each context, over the class's rules in file order. */
  const contexts = new Map<string, { context: StyleContext; said: Said[] }>();
  const order = new Map<string, { at: string; property: StyleProperty }>();
  const take = (block: Nest): void => {
    const at = `${block.context.width ?? ''}|${block.context.state ?? ''}`;
    const group = contexts.get(at) ?? { context: block.context, said: [] };
    contexts.set(at, group);
    for (const own of block.own) {
      const name = own.view.property.trim().toLowerCase();
      group.said.push({ property: name, value: own.view.value, offKit: own.view.offKit });
      const set: StyleProperty[] = [
        ...(isStyleProperty(name) ? [name] : []),
        ...(isShorthand(name) ? heldBy(name) : []),
      ];
      for (const property of set) {
        const key = `${at}|${property}`;
        if (!order.has(key)) order.set(key, { at, property });
      }
    }
    block.blocks.forEach(take);
  };
  for (const rule of classRules(text, className)) rule.blocks.forEach(take);

  const overrides: ScssOverride[] = [];
  for (const { at, property } of order.values()) {
    const group = contexts.get(at);
    if (group === undefined) continue;
    const { context } = group;
    const answer = answerFor(group.said, property, (each) => each, kindOf);
    if (answer.kind === 'part') {
      const { value, offKit, via } = answer;
      overrides.push({ context, property, value, offKit, via });
    } else if (answer.kind === 'own') {
      const { value, offKit } = answer.declaration;
      overrides.push({ context, property, value, offKit });
    }
  }
  return overrides;
}
