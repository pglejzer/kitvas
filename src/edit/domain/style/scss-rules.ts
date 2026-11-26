// The class rules of a section's SCSS file (ADR 0067): each top-level rule whose selector is one
// class, and inside it, at any depth, each rule whose prelude only joins characters of a class
// name to `&` (`&__switch`, `&--featured`, `&__card { &--featured`), which is the rule of the
// joined class. A class may have several rules; they are read together in file order, as the
// cascade reads them. Nothing here writes.

import type { Declaration, RuleView, Span } from '../types.ts';
import {
  type Block,
  type Body,
  indentAt,
  readBody,
  statements,
  withoutComments,
} from './scss-reader.ts';

/** A class rule with what the writer needs beside its view. */
export type Found = Body & {
  view: RuleView;
  /** The indent of the line its prelude starts: none for a top-level rule. */
  outer: string;
  /** The rule it is nested in as `&<suffix>`; `null` for a top-level rule. */
  parent: Found | null;
};

const CLASS_SELECTOR = /^\.(-?[A-Za-z_][A-Za-z0-9_-]*)$/;

type Place = { span: Span; block: Block; closed: boolean };

/** The rule of `className` at `place`, and after it every rule joined inside it, in file order. */
function readJoined(
  text: string,
  className: string,
  place: Place,
  parent: Found | null,
  into: Found[],
): void {
  const body = readBody(text, place.block, place.closed);
  const rule: Found = {
    ...body,
    view: {
      className,
      span: place.span,
      declarations: body.own.map((declaration) => declaration.view),
      nested: body.nested,
    },
    outer: parent === null ? '' : indentAt(text, place.span.start),
    parent,
  };
  into.push(rule);
  for (const join of body.joins) readJoined(text, `${className}${join.suffix}`, join, rule, into);
}

/** Every class rule of the file, top-level and joined, in the order they start. */
export function readRules(text: string): Found[] {
  const found: Found[] = [];
  for (const statement of statements(text, 0, text.length)) {
    if (statement.block === null) continue;
    const selector = withoutComments(text, statement.start, statement.stop).trim();
    const className = CLASS_SELECTOR.exec(selector)?.[1];
    if (className === undefined) continue;
    const span = { start: statement.start, end: statement.end };
    const place = { span, block: statement.block, closed: statement.terminated };
    readJoined(text, className, place, null, found);
  }
  return found;
}

/** The rules of `.className`, in file order. */
export const classRules = (text: string, className: string): Found[] =>
  readRules(text).filter((rule) => rule.view.className === className);

/** Every top-level rule whose selector is exactly one class, in file order, each as written. */
export function listRules(text: string): RuleView[] {
  return readRules(text)
    .filter((rule) => rule.parent === null)
    .map((rule) => rule.view);
}

/**
 * The rules of `.className` read together: each property once, with its last declaration (the
 * one the browser applies), in the order the properties first appear; `nested` of them all but
 * what one of them declares; the span of the last rule, where a new declaration goes. `null`
 * without a rule. The result keeps `'ambiguous'` for its callers; reading never gives it.
 */
export function readRule(text: string, className: string): RuleView | null | 'ambiguous' {
  const rules = classRules(text, className);
  const last = rules.at(-1);
  if (last === undefined) return null;
  const byProperty = new Map<string, Declaration>();
  for (const rule of rules) {
    for (const own of rule.own) byProperty.set(own.view.property, own.view);
  }
  const nested = new Set(rules.flatMap((rule) => rule.nested));
  return {
    className,
    span: last.view.span,
    declarations: [...byProperty.values()],
    nested: [...nested].filter((name) => !byProperty.has(name)),
  };
}
