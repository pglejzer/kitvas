// Forced states (spec 4c, goal 3; plan 16, task B): the frame copies each rule of the page's
// stylesheets that uses `:hover`, `:focus`, `:focus-visible` or `:active` into a twin that selects
// the element through `data-kv-force` (`[data-kv-force~="hover"]`, and so on; `focus` covers
// `:focus` and `:focus-visible`), in a style element of its own, and sets that attribute on the
// forced elements only. An attribute selector weighs what the pseudo-class weighs, so the twin
// wins and loses where the real state would. The twins are made again when the stylesheets change.
//
// Nothing here reaches the build or the files: the attribute and the twins live in this page only,
// and `clear` (Edit going off) removes both. `twinSelector` and `twinCss` are pure; the rest is
// the DOM around them.

import type { ForceState } from '../../channel/live-protocol.ts';
import { elementsWith } from '../edit/tree.ts';
import { EDITOR_STATE, heavier, identEnd, specificity } from './specificity.ts';

export const FORCE_ATTRIBUTE = 'data-kv-force';
const STATES: readonly ForceState[] = ['hover', 'focus', 'active'];
/** The pseudo-classes each forced state stands for. */
const PSEUDOS: Record<ForceState, readonly string[]> = {
  hover: ['hover'],
  focus: ['focus', 'focus-visible'],
  active: ['active'],
};

/** Where a string or an attribute selector that opens at `from` closes, just after it. */
function closeOf(text: string, from: number): number {
  const open = text[from];
  const close = open === '[' ? ']' : open;
  let at = from + 1;
  while (at < text.length) {
    const char = text[at];
    if (char === '\\') at += 2;
    else if (open === '[' && (char === '"' || char === "'")) at = closeOf(text, at);
    else if (char === close) return at + 1;
    else at += 1;
  }
  return text.length;
}

/** A selector list's parts at its top level: not inside `()`, `[]` or a string. */
export function splitList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let at = 0;
  while (at < selector.length) {
    const char = selector[at];
    if (char === '\\') at += 2;
    else if (char === '"' || char === "'" || char === '[') at = closeOf(selector, at);
    else {
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      else if (char === ',' && depth === 0) {
        parts.push(selector.slice(start, at).trim());
        start = at + 1;
      }
      at += 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter((part) => part !== '');
}

/** One complex selector with the state's pseudo-classes as the attribute; `null` without any. */
function rewrite(selector: string, state: ForceState): string | null {
  const names = PSEUDOS[state];
  const twin = `[${FORCE_ATTRIBUTE}~="${state}"]`;
  let out = '';
  let changed = false;
  let depth = 0;
  /** The depths of the `:not(` groups open now: a state inside one is left alone. */
  const negated: number[] = [];
  let at = 0;
  while (at < selector.length) {
    const char = selector[at];
    if (char === '\\') {
      out += selector.slice(at, at + 2);
      at += 2;
    } else if (char === '"' || char === "'" || char === '[') {
      const end = closeOf(selector, at);
      out += selector.slice(at, end);
      at = end;
    } else if (char === ':' && selector[at + 1] === ':') {
      // A pseudo-element: never a state.
      const end = identEnd(selector, at + 2);
      out += selector.slice(at, end);
      at = end;
    } else if (char === ':') {
      const end = identEnd(selector, at + 1);
      const name = selector.slice(at + 1, end).toLowerCase();
      const call = selector[end] === '(';
      if (name === 'not' && call) negated.push(depth + 1);
      if (!call && negated.length === 0 && names.includes(name)) {
        out += twin;
        changed = true;
      } else out += selector.slice(at, end);
      at = end;
    } else {
      if (char === '(') depth += 1;
      else if (char === ')') {
        if (negated.at(-1) === depth) negated.pop();
        depth -= 1;
      }
      out += char;
      at += 1;
    }
  }
  return changed ? out : null;
}

/**
 * The twin of a selector list for one forced state: each `:hover` (or the state's other
 * pseudo-classes) becomes the attribute, also inside `:is()`, `:where()` and `:has()`, never
 * inside `:not()`. Only the parts of the list that change are kept. `null` when none does, and
 * for a twin itself, so the twins are never twinned again.
 */
export function twinSelector(selector: string, state: ForceState): string | null {
  if (selector.includes(FORCE_ATTRIBUTE)) return null;
  const parts = splitList(selector)
    .map((part) => rewrite(part, state))
    .filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(', ');
}

/** A rule as the twins read it: a CSSOM rule, or a test's plain object. */
export type RuleLike =
  | { kind: 'style'; selector: string; declarations: string; children: RuleLike[] }
  /** `@media`, `@supports`, `@layer`, `@container` …: `prelude` is all before the `{`. */
  | { kind: 'group'; prelude: string; children: RuleLike[] }
  /** Declarations right inside a nested group of a style rule (CSS nesting). */
  | { kind: 'declarations'; declarations: string }
  | { kind: 'other' };

/** A nested selector in full: `&` is the parent, and a part without one is inside the parent. */
export function nestedSelector(selector: string, parent: string): string {
  const outer = `:is(${parent})`;
  return splitList(selector)
    .map((part) => (part.includes('&') ? part.replaceAll('&', outer) : `${outer} ${part}`))
    .join(', ');
}

function twinsOf(rules: readonly RuleLike[], parent: string | null, wraps: string[]): string[] {
  const out: string[] = [];
  const emit = (selector: string, declarations: string): void => {
    if (declarations.trim() === '') return;
    for (const state of STATES) {
      const twin = twinSelector(selector, state);
      if (twin === null) continue;
      const open = wraps.map((prelude) => `${prelude} { `).join('');
      out.push(`${open}${twin} { ${declarations} }${' }'.repeat(wraps.length)}`);
    }
  };
  for (const rule of rules) {
    if (rule.kind === 'style') {
      const selector = parent === null ? rule.selector : nestedSelector(rule.selector, parent);
      emit(selector, rule.declarations);
      out.push(...twinsOf(rule.children, selector, wraps));
    } else if (rule.kind === 'group') {
      out.push(...twinsOf(rule.children, parent, [...wraps, rule.prelude]));
    } else if (rule.kind === 'declarations' && parent !== null) {
      emit(parent, rule.declarations);
    }
  }
  return out;
}

/** The twin rules of `rules` for every forced state, as the text of one style element. */
export function twinCss(rules: readonly RuleLike[]): string {
  return twinsOf(rules, null, []).join('\n');
}

export type Force = {
  /** Forces `state` on the elements with these ids; `null` lets every element rest. */
  set(ids: readonly string[], state: ForceState | null): void;
  /** Edit mode went off: nothing stays forced. */
  clear(): void;
  /** The twins and the attribute brought up to date now, before a live check measures. */
  flush(): void;
  /**
   * The longhand properties that a forced-state rule heavier than the editor's own (`EDITOR_STATE`)
   * sets on the element `id`, in the state forced now: a value the editor writes there would not
   * show (ADR 0055). Empty when nothing is forced.
   */
  held(id: string): string[];
  /** The state forced now; `null` when none is. */
  state(): ForceState | null;
};

/** The rules of a CSSOM list as the twins read them. */
function readRules(list: CSSRuleList): RuleLike[] {
  const out: RuleLike[] = [];
  for (const rule of Array.from(list)) {
    if (rule instanceof CSSStyleRule) {
      // CSS nesting: a style rule may hold rules of its own.
      const children =
        'cssRules' in rule && rule.cssRules instanceof CSSRuleList ? readRules(rule.cssRules) : [];
      out.push({
        kind: 'style',
        selector: rule.selectorText,
        declarations: rule.style.cssText,
        children,
      });
    } else if (rule instanceof CSSGroupingRule) {
      const text = rule.cssText;
      const prelude = text.slice(0, text.indexOf('{')).trim();
      out.push({ kind: 'group', prelude, children: readRules(rule.cssRules) });
    } else if ('style' in rule && rule.style instanceof CSSStyleDeclaration) {
      out.push({ kind: 'declarations', declarations: rule.style.cssText });
    } else out.push({ kind: 'other' });
  }
  return out;
}

/** The marker of the readable copies of linked sheets and of the twins' own element. */
const OWN = 'data-kv-twins';

/**
 * A sheet's rules; `null` when the browser keeps them from scripts. The frame has an opaque
 * origin, so a linked sheet is cross-origin to it: its rules are read from a copy loaded with
 * CORS (`media="not all"`, so the copy never applies), which works where the prototype origin
 * allows it.
 */
function rulesOf(
  sheet: CSSStyleSheet,
  copies: Map<string, HTMLLinkElement>,
  again: () => void,
): RuleLike[] | null {
  try {
    return readRules(sheet.cssRules);
  } catch {
    const owner = sheet.ownerNode;
    if (!(owner instanceof HTMLLinkElement) || !sheet.href || copies.has(sheet.href)) return null;
    const copy = document.createElement('link');
    copy.rel = 'stylesheet';
    copy.media = 'not all';
    copy.crossOrigin = 'anonymous';
    copy.setAttribute(OWN, 'copy');
    copy.href = sheet.href;
    copy.addEventListener('load', again);
    copies.set(sheet.href, copy);
    document.head.append(copy);
    return null;
  }
}

export function createForce(): Force {
  let ids: ReadonlySet<string> = new Set();
  let state: ForceState | null = null;
  let style: HTMLStyleElement | null = null;
  let signature = '';
  // A timer, not an animation frame: a card scrolled out of view gets no frames, and its forced
  // state must still be right when the person scrolls to it or a live check measures it.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const copies = new Map<string, HTMLLinkElement>();
  const marked = new Set<Element>();
  const observer =
    typeof MutationObserver === 'function' ? new MutationObserver(() => schedule()) : undefined;

  /** Every sheet of the page but the twins' own. */
  function sheets(): CSSStyleSheet[] {
    const linked = Array.from(document.styleSheets).filter((sheet) => sheet.ownerNode !== style);
    const adopted = 'adoptedStyleSheets' in document ? document.adoptedStyleSheets : [];
    return [...linked, ...adopted];
  }

  /** The twins again when a sheet came, went, or got rules (`insertRule` leaves the DOM alone). */
  function twin(): void {
    const rules: RuleLike[] = [];
    const counts: string[] = [];
    for (const sheet of sheets()) {
      // A linked sheet the frame may not read is skipped; its copy is read in its place.
      const read = rulesOf(sheet, copies, schedule);
      if (read === null) continue;
      counts.push(String(read.length));
      rules.push(...read);
    }
    const next = counts.join(',');
    if (style?.isConnected && next === signature) return;
    signature = next;
    if (!style) {
      style = document.createElement('style');
      style.setAttribute(OWN, 'twins');
    }
    style.textContent = twinCss(rules);
    if (!style.isConnected) document.head.append(style);
  }

  /** The attribute on the forced elements only: a render may have made them anew. */
  function mark(): void {
    const now = state === null ? [] : elementsWith(ids);
    for (const element of marked) {
      if (!now.includes(element)) element.removeAttribute(FORCE_ATTRIBUTE);
    }
    marked.clear();
    if (state === null) return;
    for (const element of now) {
      if (element.getAttribute(FORCE_ATTRIBUTE) !== state) {
        element.setAttribute(FORCE_ATTRIBUTE, state);
      }
      marked.add(element);
    }
  }

  function schedule(): void {
    if (state === null || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      if (state === null) return;
      twin();
      mark();
    });
  }

  function stop(): void {
    observer?.disconnect();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    state = null;
    ids = new Set();
    mark();
    style?.remove();
    signature = '';
  }

  return {
    set(next, forced) {
      if (forced === null || next.length === 0) {
        stop();
        return;
      }
      ids = new Set(next);
      state = forced;
      twin();
      mark();
      // A sheet that loads or changes, and a render that makes the elements anew.
      observer?.observe(document.head, { childList: true, subtree: true, characterData: true });
      observer?.observe(document.body, { childList: true, subtree: true });
    },
    clear: stop,
    flush() {
      if (state === null) return;
      twin();
      mark();
    },
    state: () => state,
    held(id) {
      if (state === null || !style?.sheet) return [];
      twin();
      mark();
      const [element] = elementsWith(new Set([id]));
      if (!element) return [];
      return heldBy(element, style.sheet.cssRules, state);
    },
  };
}

/** The longhands that the twins of `state` heavier than the editor's set on `element`. */
function heldBy(element: Element, list: CSSRuleList, state: ForceState): string[] {
  const mark = `[${FORCE_ATTRIBUTE}~="${state}"]`;
  const out = new Set<string>();
  for (const rule of Array.from(list)) {
    if (rule instanceof CSSStyleRule) {
      const wins = splitList(rule.selectorText).some(
        (part) =>
          part.includes(mark) && element.matches(part) && heavier(specificity(part), EDITOR_STATE),
      );
      if (!wins) continue;
      for (let index = 0; index < rule.style.length; index += 1) out.add(rule.style.item(index));
    } else if (rule instanceof CSSMediaRule) {
      if (matchMedia(rule.media.mediaText).matches) {
        for (const one of heldBy(element, rule.cssRules, state)) out.add(one);
      }
    } else if (rule instanceof CSSSupportsRule) {
      for (const one of heldBy(element, rule.cssRules, state)) out.add(one);
    }
    // A layered rule loses to the draft's own unlayered one whatever it weighs.
  }
  return [...out].sort();
}
