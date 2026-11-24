// Style operations with a width or a state (spec 4c, goal 2): the declaration lives in a block
// nested in the element's class rule. `@media (min-width: Npx)` blocks stand after the rule's own
// declarations in ascending width, then `&:hover`, `&:focus-visible` and `&:active`; a state at a
// width is that state's block inside the width's block. A block that an operation creates
// (`newBlock`) is taken away by its inverse (`dropBlock`) byte for byte, and so is a rule.

import { STYLE_STATES, type StyleContext } from '../ops.ts';
import { type ApplyResult, isStyleProperty, type StyleProperty } from '../types.ts';
import { type Body, type Found, type Nest, readRules } from './scss-reader.ts';
import {
  addDeclaration,
  blockCut,
  blockText,
  bodyIndent,
  createRule,
  declarationCut,
  declarationText,
  dropEmptyRule,
  emptyBody,
  eolOf,
  fileIndent,
  holds,
  indentAt,
  replaceValue,
  type ScssOp,
  type ScssOptions,
  slotBefore,
  splice,
} from './scss-write.ts';

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
    return { parent: rule, outer: '', target, missing: [context] };
  }
  const media = blockIn(rule, widthOnly(context));
  if (media === 'ambiguous') return media;
  if (media === undefined) {
    return { parent: rule, outer: '', target: undefined, missing: [widthOnly(context), context] };
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
  const next = nextOf(parent, first);
  // After a last declaration without its `;` a block would not parse.
  if (next === parent.close && parent.dangling) return { refused: 'invalid' };
  const slot = slotBefore(text, parent, next);
  const preludes = preludesOf(missing.at(-1) ?? first).slice(-missing.length);
  const eol = eolOf(text);
  const insert = slot.lines
    ? (slot.lead ? eol : '') +
      blockText(preludes, declaration, {
        indent: bodyIndent(text, parent, place.outer),
        eol,
        unit: fileIndent(text),
      })
    : blockText(preludes, declaration, null);
  return {
    text: splice(text, slot.at, slot.at, insert),
    changed: [{ start: slot.at, end: slot.at + insert.length }],
  };
}

/** The rule `.className` when the text has exactly one, closed. */
function oneRule(text: string, className: string): Found | undefined {
  const rules = readRules(text).filter((rule) => rule.view.className === className);
  return rules.length === 1 && rules[0]?.closed ? rules[0] : undefined;
}

/**
 * The text without the context's block when the block is empty, and then without the width's
 * block around a state's when that is empty too: what `insertBlocks` put in, or less.
 */
function dropEmptyBlocks(text: string, className: string, context: StyleContext): string {
  let next = text;
  const both = context.width !== null && context.state !== null;
  for (const each of both ? [context, widthOnly(context)] : [context]) {
    const rule = oneRule(next, className);
    const place = rule === undefined ? 'open' : placeOf(next, rule, each);
    if (typeof place === 'string' || place.target === undefined) return next;
    if (!emptyBody(next, place.target)) return next;
    const cut = blockCut(next, place.parent, place.target);
    next = splice(next, cut.start, cut.end, '');
  }
  return next;
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
  const rules = readRules(text).filter((rule) => rule.view.className === op.className);
  if (rules.length > 1) return { refused: 'ambiguous' };
  const rule = rules[0];
  if (rule === undefined) {
    if (op.op !== 'setStyle' || !op.newRule) return { refused: 'not-found' };
    if (op.before !== null && !options.force) return { refused: 'not-found' };
    const declaration = declarationText(op.property, op.value);
    return createRule(text, op.className, (indent, eol) =>
      blockText(preludesOf(context), declaration, { indent, eol, unit: indent }),
    );
  }
  if (!rule.closed) return { refused: 'invalid' };
  const place = placeOf(text, rule, context);
  if (place === 'ambiguous') return { refused: 'ambiguous' };
  if (place === 'open') return { refused: 'invalid' };

  const { target } = place;
  if (target === undefined) {
    // No block: nothing to remove, and no value the person could have seen there.
    if (op.op === 'removeStyle') return options.force ? { refused: 'not-found' } : conflict();
    if (op.before !== null && !options.force) return conflict();
    if (op.newBlock !== true && !options.force) return { refused: 'not-found' };
    return insertBlocks(text, place, declarationText(op.property, op.value));
  }
  if (!target.closed) return { refused: 'invalid' };
  const matches = target.own.filter((declaration) => declaration.view.property === op.property);
  if (matches.length > 1) return { refused: 'ambiguous' };
  const found = matches[0];
  if (found === undefined && target.nested.includes(op.property)) return { refused: 'nested' };
  if (!options.force && !holds(found, op.before)) return conflict();

  if (op.op === 'setStyle') {
    if (found !== undefined) return replaceValue(text, found, op.value);
    const outer = indentAt(text, target.span.start);
    return addDeclaration(text, target, outer, declarationText(op.property, op.value));
  }
  if (found === undefined) return { refused: 'not-found' };
  const cut = declarationCut(text, found.view.span);
  let next = splice(text, cut.start, cut.end, '');
  if (op.dropBlock === true) next = dropEmptyBlocks(next, op.className, context);
  const result: ApplyResult = { text: next, changed: [{ start: cut.start, end: cut.start }] };
  return (op.dropRule ? dropEmptyRule(next, op.className) : null) ?? result;
}

/** A value the rule sets for a width or a state: one declaration of one of its context blocks. */
export type ScssOverride = {
  context: StyleContext;
  property: StyleProperty;
  value: string;
  offKit: boolean;
};

/**
 * Every value the rule `.className` sets in a context block, for the properties of the editor's
 * set: the last declaration of each property of each block, which is the one the browser applies.
 * None when the text has no such rule, or two.
 */
export function scssOverrides(text: string, className: string): ScssOverride[] {
  const rules = readRules(text).filter((rule) => rule.view.className === className);
  const rule = rules.length === 1 ? rules[0] : undefined;
  const found: ScssOverride[] = [];
  const take = (block: Nest): void => {
    const last = new Map<StyleProperty, ScssOverride>();
    for (const own of block.own) {
      const property = own.view.property.trim().toLowerCase();
      if (!isStyleProperty(property)) continue;
      const { value, offKit } = own.view;
      last.set(property, { context: block.context, property, value, offKit });
    }
    found.push(...last.values());
    block.blocks.forEach(take);
  };
  rule?.blocks.forEach(take);
  return found;
}
