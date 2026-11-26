// The editor of a section's SCSS file (spec 4a, decisions 3 and 10; spike 2): it reads the class
// rules and sets, adds or removes one declaration, or one whole rule. It is hand-written and has
// no parser behind it, so it only ever cuts and pastes inside the span it names: every other byte
// of the file, its line endings and its indentation stay as they were, and an operation followed
// by its inverse gives the file back exactly. A value a keyword or image property may not take is
// refused before anything is cut (plan 15, `style-values.ts`). An operation with a width or a
// state goes to that block of the rule (spec 4c, `scss-context.ts`), and so does one with an
// option's value (ADR 0082); the cuts and pastes both
// share are in `scss-write.ts`. A class's rules are the top-level `.class` rules and the ones
// nested as `&__part` (ADR 0067, `scss-rules.ts`), read together in file order. A property a
// shorthand of the rule holds is written inside that shorthand, or right after one that does not
// split (ADR 0070, `shorthand-write.ts`).

import { isBaseContext } from '../ops.ts';
import type { ApplyResult } from '../types.ts';
import { applyScssContext } from './scss-context.ts';
import { scssBalanced } from './scss-reader.ts';
import { classRules, type Found, listRules, readRule } from './scss-rules.ts';
import {
  addDeclaration,
  declarationCut,
  declarationText,
  dropEmptyRule,
  newRule,
  replaceValue,
  type ScssOp,
  type ScssOptions,
  splice,
} from './scss-write.ts';
import { untyped } from './shorthand-source.ts';
import { heldIn, holdsHeld, setBeside, withoutPart } from './shorthand-write.ts';
import { styleValueRefusal } from './style-values.ts';

export { type ScssOverride, scssOverrides } from './scss-context.ts';
export type { ScssOp, ScssOptions } from './scss-write.ts';
export {
  SHORTHANDS,
  type Shorthand,
  shorthandsOf,
  splitShorthand,
  type VarKind,
  withPart,
} from './shorthand.ts';
export { varKindOf } from './shorthand-source.ts';
export {
  IMAGE_FILE,
  imageOfUrl,
  imageUrl,
  keywordOfWord,
  MAX_IMAGES,
  plainValue,
  styleValueRefusal,
} from './style-values.ts';
export { listRules, readRule, scssBalanced };

const noImage = (): boolean => false;

/**
 * The rule a new declaration of the base goes into: the class's last rule, so that no later rule
 * of the class wins over it; but the first rule with a width block that sets the property, when
 * one has, where it goes above that rule's blocks, so the width still wins. An option's block wins
 * by its selector wherever it stands (ADR 0082).
 */
function homeOf(rules: readonly Found[], property: string): Found | undefined {
  const widthSets = (rule: Found): boolean =>
    rule.blocks.some(
      (block) =>
        block.context.width !== null &&
        block.context.state === null &&
        block.own.some((own) => own.view.property === property),
    );
  return rules.find(widthSets) ?? rules.at(-1);
}

/** Applies one style operation to a section's SCSS text; never a part of it. */
export function applyScss(text: string, op: ScssOp, options: ScssOptions): ApplyResult {
  if (op.op === 'setStyle') {
    const refusal = styleValueRefusal(op.property, op.value, options.hasImage ?? noImage);
    if (refusal !== null) return { refused: refusal };
  }
  const { context } = op;
  if (context !== undefined && !isBaseContext(context)) {
    return applyScssContext(text, op, context, options);
  }
  const rules = classRules(text, op.className);
  const home = homeOf(rules, op.property);
  if (home === undefined) {
    if (op.op !== 'setStyle' || !op.newRule) return { refused: 'not-found' };
    // A rule the person saw a value in is gone: that is not a rule to create.
    if (op.before !== null && !options.force) return { refused: 'not-found' };
    return newRule(text, op.className, [], declarationText(op.property, op.value));
  }
  if (rules.some((rule) => !rule.closed)) return { refused: 'invalid' };

  const kindOf = options.varKind ?? untyped;
  const held = heldIn(rules, op.property, kindOf);
  if (held === 'ambiguous') return { refused: 'ambiguous' };
  const nested = rules.some((rule) => rule.nested.includes(op.property));
  if (held.kind === 'none' && nested) return { refused: 'nested' };
  if (!options.force && !holdsHeld(held, op.before)) return { conflict: 'changed' };

  if (op.op === 'setStyle') {
    if (held.kind === 'own') return replaceValue(text, held.own, op.value);
    // A shorthand answers for the property, or stands where it would go (ADR 0070).
    const beside = held.kind === 'part' ? held : held.after;
    return beside === null
      ? addDeclaration(text, home, home.outer, declarationText(op.property, op.value))
      : setBeside(text, beside, beside.body.outer, op, kindOf);
  }
  if (held.kind === 'none') return { refused: 'not-found' };
  if (held.kind === 'part') {
    const without = withoutPart(text, held, op.property, kindOf);
    if (without !== 'last') return without;
  }
  // The property's own declaration, or the shorthand its last part has left.
  const cut = declarationCut(text, held.own.view.span);
  const next = splice(text, cut.start, cut.end, '');
  const result: ApplyResult = { text: next, changed: [{ start: cut.start, end: cut.start }] };
  return (op.dropRule ? dropEmptyRule(next, op.className) : null) ?? result;
}
