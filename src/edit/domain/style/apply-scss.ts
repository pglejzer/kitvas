// The editor of a section's SCSS file (spec 4a, decisions 3 and 10; spike 2): it reads the class
// rules and sets, adds or removes one declaration, or one whole rule. It is hand-written and has
// no parser behind it, so it only ever cuts and pastes inside the span it names: every other byte
// of the file, its line endings and its indentation stay as they were, and an operation followed
// by its inverse gives the file back exactly. A value a keyword or image property may not take is
// refused before anything is cut (plan 15, `style-values.ts`). An operation with a width or a
// state goes to that block of the rule (spec 4c, `scss-context.ts`); the cuts and pastes both
// share are in `scss-write.ts`. A class's rules are the top-level `.class` rules and the ones
// nested as `&__part` (ADR 0067, `scss-rules.ts`), read together in file order.

import type { ApplyResult } from '../types.ts';
import { applyScssContext } from './scss-context.ts';
import { scssBalanced } from './scss-reader.ts';
import { classRules, type Found, listRules, readRule } from './scss-rules.ts';
import {
  addDeclaration,
  declarationCut,
  declarationText,
  dropEmptyRule,
  holds,
  lastDeclaration,
  newRule,
  replaceValue,
  type ScssOp,
  type ScssOptions,
  splice,
} from './scss-write.ts';
import { styleValueRefusal } from './style-values.ts';

export { type ScssOverride, scssOverrides } from './scss-context.ts';
export type { ScssOp, ScssOptions } from './scss-write.ts';
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
 * one has, where it goes above that rule's blocks, so the width still wins.
 */
function homeOf(rules: readonly Found[], property: string): Found | undefined {
  const widthSets = (rule: Found): boolean =>
    rule.blocks.some(
      (block) =>
        block.context.state === null && block.own.some((own) => own.view.property === property),
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
  if (context !== undefined && (context.width !== null || context.state !== null)) {
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

  const found = lastDeclaration(rules, op.property);
  if (found === 'ambiguous') return { refused: 'ambiguous' };
  const nested = rules.some((rule) => rule.nested.includes(op.property));
  if (found === undefined && nested) return { refused: 'nested' };
  if (!options.force && !holds(found, op.before)) return { conflict: 'changed' };

  if (op.op === 'setStyle') {
    return found === undefined
      ? addDeclaration(text, home, home.outer, declarationText(op.property, op.value))
      : replaceValue(text, found, op.value);
  }
  if (found === undefined) return { refused: 'not-found' };
  const cut = declarationCut(text, found.view.span);
  const next = splice(text, cut.start, cut.end, '');
  const result: ApplyResult = { text: next, changed: [{ start: cut.start, end: cut.start }] };
  return (op.dropRule ? dropEmptyRule(next, op.className) : null) ?? result;
}
