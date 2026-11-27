// Which declaration answers for a property among the declarations of one body, or of a class's
// rules read together (ADR 0070): the property's own, or a shorthand written after it that holds
// it. The reader (`source.ts`), the overrides and the writers (`shorthand-write.ts`) all ask
// here, so the panel shows the declaration a write then changes. Pure.

import type { StyleProperty } from '../types.ts';
import {
  rawPart,
  type Shorthand,
  shorthandsOf,
  splitShorthand,
  type VarKind,
} from './shorthand.ts';

/** A declaration as the answer needs it. */
export type Said = { property: string; value: string; offKit: boolean };

/**
 * What declarations in the order the cascade reads them say of one property.
 * - `own`: its own declaration answers: the last thing written of it, or the last one of its name
 *   under a shorthand that does not split or leaves the part out (the property then reads as it
 *   does without the shorthand).
 * - `part`: a shorthand written after every declaration of the property holds it. `offKit`: the
 *   declaration has the marker and this part is a raw value.
 * - `none`: nothing sets it. `after`: the shorthand that stands last all the same; `open` when it
 *   splits and only leaves this part out, so the part can be added to it.
 */
export type Answer<D> =
  | { kind: 'own'; declaration: D }
  | { kind: 'part'; declaration: D; via: Shorthand; value: string; offKit: boolean }
  | { kind: 'none'; after: { declaration: D; via: Shorthand; open: boolean } | null };

/** No `var` is typed: a `border`, `outline` or `background` with one does not split. */
export const untyped: VarKind = () => null;

export function answerFor<D>(
  declarations: readonly D[],
  property: StyleProperty,
  said: (declaration: D) => Said,
  kindOf: VarKind,
): Answer<D> {
  const shorthands = shorthandsOf(property);
  let own: D | undefined;
  let last: { declaration: D; via: Shorthand | null } | undefined;
  for (const declaration of declarations) {
    const name = said(declaration).property;
    if (name === property) {
      own = declaration;
      last = { declaration, via: null };
      continue;
    }
    const via = shorthands.find((shorthand) => shorthand === name);
    if (via !== undefined) last = { declaration, via };
  }
  if (last === undefined) return { kind: 'none', after: null };
  const { declaration, via } = last;
  if (via === null) return { kind: 'own', declaration };
  const { value, offKit } = said(declaration);
  const parts = splitShorthand(via, value, kindOf);
  const part = parts?.[property];
  if (part !== undefined) {
    const raw = offKit && rawPart(property, part);
    return { kind: 'part', declaration, via, value: part, offKit: raw };
  }
  if (own !== undefined) return { kind: 'own', declaration: own };
  return { kind: 'none', after: { declaration, via, open: parts !== null } };
}

const plain = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

type Groups = Readonly<Partial<Record<string, Readonly<Record<string, readonly string[]>>>>>;
type Kinds = Map<string, 'dimension' | 'color' | null>;

/** Each token's name without case and separators, with its kind; `null` where two kinds meet. */
function kindsOf(groups: Groups): Kinds {
  const kinds: Kinds = new Map();
  for (const [type, byGroup] of Object.entries(groups)) {
    const kind = type === 'dimension' || type === 'color' ? type : null;
    for (const [group, names] of Object.entries(byGroup ?? {})) {
      for (const name of names) {
        const key = plain(`${group}${name}`);
        kinds.set(key, kinds.has(key) && kinds.get(key) !== kind ? null : kind);
      }
    }
  }
  return kinds;
}

const KIT_VAR = '--kit-';

/**
 * What types a `var(--kit-…)` from the kit's token groups (`tokenGroupsOf`): `--kit-space-12` is
 * the dimension `12` of `space`. Names compare without case and separators, as the token's
 * variable is its path in kebab case. A name two tokens of different types share is not typed.
 * The groups are read when the first `var` asks.
 */
export function varKindOf(groups: Groups): VarKind {
  let kinds: Kinds | undefined;
  return (name) => {
    if (!name.startsWith(KIT_VAR)) return null;
    kinds ??= kindsOf(groups);
    return kinds.get(plain(name.slice(KIT_VAR.length))) ?? null;
  };
}
