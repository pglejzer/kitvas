// The editor of a section's SCSS file (spec 4a, decisions 3 and 10; spike 2): it reads top-level
// class rules and sets, adds or removes one declaration, or one whole rule. It is hand-written and
// has no parser behind it, so it only ever cuts and pastes inside the span it names: every other
// byte of the file, its line endings and its indentation stay as they were, and an operation
// followed by its inverse gives the file back exactly. A value a keyword or image property may
// not take is refused before anything is cut (plan 15, `style-values.ts`). An operation with a
// width or a state goes to that block of the rule (spec 4c, `scss-context.ts`); the cuts and
// pastes both share are in `scss-write.ts`.

import type { ApplyResult } from '../types.ts';
import { applyScssContext } from './scss-context.ts';
import { listRules, readRule, readRules, scssBalanced } from './scss-reader.ts';
import {
  addDeclaration,
  createRule,
  declarationCut,
  declarationText,
  dropEmptyRule,
  holds,
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
  const rules = readRules(text).filter((rule) => rule.view.className === op.className);
  if (rules.length > 1) return { refused: 'ambiguous' };
  const rule = rules[0];
  if (rule === undefined) {
    if (op.op !== 'setStyle' || !op.newRule) return { refused: 'not-found' };
    // A rule the person saw a value in is gone: that is not a rule to create.
    if (op.before !== null && !options.force) return { refused: 'not-found' };
    const declaration = declarationText(op.property, op.value);
    return createRule(text, op.className, (indent, eol) => `${indent}${declaration}${eol}`);
  }
  if (!rule.closed) return { refused: 'invalid' };

  const matches = rule.own.filter((declaration) => declaration.view.property === op.property);
  if (matches.length > 1) return { refused: 'ambiguous' };
  const found = matches[0];
  if (found === undefined && rule.nested.includes(op.property)) return { refused: 'nested' };
  if (!options.force && !holds(found, op.before)) return { conflict: 'changed' };

  if (op.op === 'setStyle') {
    return found === undefined
      ? addDeclaration(text, rule, '', declarationText(op.property, op.value))
      : replaceValue(text, found, op.value);
  }
  if (found === undefined) return { refused: 'not-found' };
  const cut = declarationCut(text, found.view.span);
  const next = splice(text, cut.start, cut.end, '');
  const result: ApplyResult = { text: next, changed: [{ start: cut.start, end: cut.start }] };
  return (op.dropRule ? dropEmptyRule(next, op.className) : null) ?? result;
}
