// The specificity of a complex selector (Selectors Level 4), for "does the kit's own state rule
// win over the editor's?" (spec 4c, goal 2; ADR 0055). The editor writes a state as `.class:hover`
// (and Tailwind as `.hover\:x:hover`): (0, 2, 0). A kit rule that weighs more keeps its value
// whatever the person sets, so the panel says so before writing.

export type Specificity = readonly [number, number, number];

/** What the editor's own state rule weighs: one class and one pseudo-class. */
export const EDITOR_STATE: Specificity = [0, 2, 0];

const IDENT = /[A-Za-z0-9_-]/;

/** Where the identifier starting at `from` ends (escapes and non-ASCII letters belong to it). */
export function identEnd(text: string, from: number): number {
  let at = from;
  while (at < text.length) {
    const char = text[at] ?? '';
    if (char === '\\') at += 2;
    else if (IDENT.test(char) || char.charCodeAt(0) > 127) at += 1;
    else break;
  }
  return Math.min(at, text.length);
}

/** Just after the `]`, quote or `)` that closes what opens at `from`. */
function closeOf(text: string, from: number): number {
  const open = text[from];
  const close = open === '[' ? ']' : open === '(' ? ')' : open;
  let depth = 0;
  let at = from + 1;
  while (at < text.length) {
    const char = text[at];
    if (char === '\\') at += 2;
    else if (open !== '"' && open !== "'" && (char === '"' || char === "'")) at = closeOf(text, at);
    else if (open === '(' && char === '(') {
      depth += 1;
      at += 1;
    } else if (char === close) {
      if (depth === 0) return at + 1;
      depth -= 1;
      at += 1;
    } else at += 1;
  }
  return text.length;
}

/** The parts of a selector list at its top level. */
function parts(list: string): string[] {
  const out: string[] = [];
  let start = 0;
  let at = 0;
  while (at < list.length) {
    const char = list[at];
    if (char === '\\') at += 2;
    else if (char === '"' || char === "'" || char === '[' || char === '(') at = closeOf(list, at);
    else {
      if (char === ',') {
        out.push(list.slice(start, at).trim());
        start = at + 1;
      }
      at += 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter((part) => part !== '');
}

const add = (a: Specificity, b: Specificity): Specificity => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

/** `a` weighs more than `b`. */
export function heavier(a: Specificity, b: Specificity): boolean {
  for (let index = 0; index < 3; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

const most = (list: string): Specificity =>
  parts(list)
    .map(specificity)
    .reduce<Specificity>((best, one) => (heavier(one, best) ? one : best), [0, 0, 0]);

/**
 * One complex selector's weight: ids, then classes, attributes and pseudo-classes, then types and
 * pseudo-elements. `:is()`, `:not()` and `:has()` weigh their heaviest argument, `:where()` none,
 * `:nth-child(… of S)` one plus its list's.
 */
export function specificity(selector: string): Specificity {
  let weight: Specificity = [0, 0, 0];
  let at = 0;
  while (at < selector.length) {
    const char = selector[at] ?? '';
    if (char === '\\') {
      at += 2;
    } else if (char === '#') {
      weight = add(weight, [1, 0, 0]);
      at = identEnd(selector, at + 1);
    } else if (char === '.') {
      weight = add(weight, [0, 1, 0]);
      at = identEnd(selector, at + 1);
    } else if (char === '[') {
      weight = add(weight, [0, 1, 0]);
      at = closeOf(selector, at);
    } else if (char === ':' && selector[at + 1] === ':') {
      weight = add(weight, [0, 0, 1]);
      const end = identEnd(selector, at + 2);
      at = selector[end] === '(' ? closeOf(selector, end) : end;
    } else if (char === ':') {
      const end = identEnd(selector, at + 1);
      const name = selector.slice(at + 1, end).toLowerCase();
      if (selector[end] !== '(') {
        weight = add(weight, [0, 1, 0]);
        at = end;
        continue;
      }
      const close = closeOf(selector, end);
      const inner = selector.slice(end + 1, close - 1);
      if (name === 'where') {
        // Weighs nothing.
      } else if (name === 'is' || name === 'not' || name === 'has' || name === 'matches') {
        weight = add(weight, most(inner));
      } else if (name === 'nth-child' || name === 'nth-last-child') {
        const of = /\bof\b/i.exec(inner);
        weight = add(weight, [0, 1, 0]);
        if (of) weight = add(weight, most(inner.slice(of.index + 2)));
      } else {
        weight = add(weight, [0, 1, 0]);
      }
      at = close;
    } else if (IDENT.test(char) || char.charCodeAt(0) > 127) {
      // A type selector (`button`, `svg|rect` counts once).
      weight = add(weight, [0, 0, 1]);
      at = identEnd(selector, at);
      if (selector[at] === '|') at = identEnd(selector, at + 1);
    } else {
      // Combinators, `*`, spaces, `|`.
      at += 1;
    }
  }
  return weight;
}
