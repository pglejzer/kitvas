// Writing where a shorthand answers for a property (ADR 0070), shared by the base writer
// (`apply-scss.ts`) and the context writer (`scss-context.ts`): what the bodies hold for the
// property, whether that is what the person saw, the value set inside the shorthand, and a part
// taken out of it. A shorthand whose value does not split is never changed: the property goes in
// as its own declaration right after it, a whole line or a piece of one that `declarationCut`
// takes away again. The off-kit marker stays after a shorthand while one of its parts is raw.

import { type StyleValue, styleText } from '../ops.ts';
import { type ApplyResult, isStyleProperty } from '../types.ts';
import type { Body, Own } from './scss-reader.ts';
import {
  bodyIndent,
  declarationText,
  eolOf,
  holds,
  lastDeclaration,
  replaceText,
  slotBefore,
  splice,
} from './scss-write.ts';
import { rawBeside, type Shorthand, type VarKind, withPart } from './shorthand.ts';
import { answerFor } from './shorthand-source.ts';

/** A shorthand's declaration, in the body it stands in. */
export type Beside<B extends Body> = { own: Own; body: B; via: Shorthand };

/**
 * What bodies in file order hold for a property (`answerFor`). `own`: its own declaration. `part`:
 * a shorthand holds it, with the part's value and whether it reads as off-kit. `none`: nothing
 * sets it; `after` is the shorthand that stands last all the same, `open` when the part can be
 * added to it.
 */
export type Held<B extends Body> =
  | { kind: 'own'; own: Own }
  | ({ kind: 'part'; value: string; offKit: boolean } & Beside<B>)
  | { kind: 'none'; after: (Beside<B> & { open: boolean }) | null };

/**
 * What `bodies` hold for `property`, and `'ambiguous'` when the body of the declaration that
 * answers declares that name twice, as a fallback pair may. A property outside the editor's set
 * has no shorthand here: its last declaration answers.
 */
export function heldIn<B extends Body>(
  bodies: readonly B[],
  property: string,
  kindOf: VarKind,
): Held<B> | 'ambiguous' {
  if (!isStyleProperty(property)) {
    const found = lastDeclaration(bodies, property);
    if (found === 'ambiguous') return found;
    return found === undefined ? { kind: 'none', after: null } : { kind: 'own', own: found };
  }
  const all = bodies.flatMap((body) => body.own.map((own) => ({ own, body })));
  const answer = answerFor(all, property, (each) => each.own.view, kindOf);
  if (answer.kind === 'none') {
    const { after } = answer;
    if (after === null) return { kind: 'none', after: null };
    const { own, body } = after.declaration;
    return { kind: 'none', after: { own, body, via: after.via, open: after.open } };
  }
  const { own, body } = answer.declaration;
  const name = own.view.property;
  if (body.own.filter((each) => each.view.property === name).length > 1) return 'ambiguous';
  if (answer.kind === 'own') return { kind: 'own', own };
  return { kind: 'part', own, body, via: answer.via, value: answer.value, offKit: answer.offKit };
}

/** The file holds what the person saw: `before`, as a declaration or as a shorthand's part. */
export function holdsHeld<B extends Body>(held: Held<B>, before: StyleValue | null): boolean {
  if (held.kind === 'own') return holds(held.own, before);
  if (held.kind === 'none') return before === null;
  if (before === null) return false;
  const seen = styleText(before);
  return seen.value === held.value && seen.offKit === held.offKit;
}

/**
 * A new declaration right after `own`, a statement of `body`: on the first line after it when the
 * next statement (or the closing brace) starts a line, else in the line with one space after it.
 * `outer`: the indent of the body's own first line.
 */
function addAfter(
  text: string,
  body: Body,
  outer: string,
  own: Own,
  declaration: string,
): ApplyResult {
  const at = body.parts.findIndex((part) => part.start === own.view.span.start);
  const next = body.parts[at + 1]?.start ?? body.close;
  // Nothing can follow a last declaration that has no `;`.
  if (at < 0 || (next === body.close && body.dangling)) return { refused: 'invalid' };
  const slot = slotBefore(text, body, next);
  const insert = slot.lines
    ? `${bodyIndent(text, body, outer)}${declaration}${eolOf(text)}`
    : `${declaration} `;
  return {
    text: splice(text, slot.at, slot.at, insert),
    changed: [{ start: slot.at, end: slot.at + insert.length }],
  };
}

/**
 * A value set where a shorthand answers or stands last: inside the shorthand, with every other
 * part as written, when its value splits and can say the new one; else as the property's own
 * declaration right after it, and the shorthand's text stays as it is.
 */
export function setBeside<B extends Body>(
  text: string,
  at: Beside<B>,
  outer: string,
  op: { property: string; value: StyleValue },
  kindOf: VarKind,
): ApplyResult {
  const { property } = op;
  const written = styleText(op.value);
  const next = isStyleProperty(property)
    ? withPart(at.via, at.own.view.value, property, written.value, kindOf)
    : null;
  if (next === null || !isStyleProperty(property)) {
    return addAfter(text, at.body, outer, at.own, declarationText(property, op.value));
  }
  const marked =
    written.offKit || (at.own.view.offKit && rawBeside(at.via, next, property, kindOf));
  return replaceText(text, at.own, next, marked);
}

/**
 * A part taken out of the shorthand that holds it. `'last'`: it was the only part, so the whole
 * declaration goes, as a declaration of the property would. A side of a box or of a pair has no
 * declaration of its own to remove and no value says the box without it: `not-found`.
 */
export function withoutPart<B extends Body>(
  text: string,
  held: Beside<B>,
  property: string,
  kindOf: VarKind,
): ApplyResult | 'last' {
  const next = isStyleProperty(property)
    ? withPart(held.via, held.own.view.value, property, null, kindOf)
    : null;
  if (next === null || !isStyleProperty(property)) return { refused: 'not-found' };
  if (next === '') return 'last';
  const marked = held.own.view.offKit && rawBeside(held.via, next, property, kindOf);
  return replaceText(text, held.own, next, marked);
}
