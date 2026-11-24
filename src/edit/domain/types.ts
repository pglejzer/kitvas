// What the pure parts of the editor read from source text and answer with (plan 13, C2 and C6).
// Offsets are UTF-16 indexes into the file's text, as JavaScript strings count them.

import type { PropValue, StyleValue } from './ops.ts';

/** A range of the text: `start` inclusive, `end` exclusive. */
export type Span = { start: number; end: number };

/**
 * Where an offset of a text before a change is in the text after it; `null` for a place the change
 * removed (spec 4b, decision 7: the rename map is made from it).
 */
export type OffsetMap = (old: number) => number | null;

/**
 * Why kitvas will not write an edit itself. The panel shows the reason and offers "Ask Claude".
 * - `computed`: the value is an expression (`variant={tone}`, `{plan.name}`, a `className` built in code).
 * - `spread`: the tag has `{...props}`, which may set the same prop.
 * - `not-found`: the element, its tag, its rule or the value it had is not where it was.
 * - `ambiguous`: two places match where one was expected.
 * - `no-text`: the element has no single plain text child (it holds elements or expressions).
 * - `has-class`: `addClass` on an element that already has a `className`.
 * - `no-classname`: the kit component does not take a `className`, so a style cannot reach it.
 * - `utility`: the value comes from a utility class (Tailwind); utility edits are stage 4c.
 * - `nested`: the declaration sits in a nested block or a media query, not in the rule's own body.
 * - `invalid`: the result would not compile; nothing was written.
 */
export const REFUSALS = [
  'computed',
  'spread',
  'not-found',
  'ambiguous',
  'no-text',
  'has-class',
  'no-classname',
  'utility',
  'nested',
  'invalid',
  // Structure (spec 4b, decision 6).
  /** Inside a `{…}` child expression: a `.map`, a condition, a ternary. */
  'in-expression',
  /** The element a section's function returns: moved and deleted as a section. */
  'section-root',
  /** The JSX of a prop (`title={<Heading />}`): replaced, never moved out or deleted. */
  'slot-root',
  /** Names a variable or a non-kit component that does not exist where it would go. */
  'scope',
  /** A class it carries has another rule of the same name in the target section. */
  'class-clash',
  /** The anchor takes no children (no `children: node` in the catalog, or a void element). */
  'not-accepted',
  /** The parent mixes text and elements: a move there changes the spaces between words. */
  'mixed',
  /** An interactive element inside another (a button in a button, a link in a link). */
  'nested-interactive',
  /** Wrap: `first` and `last` are not siblings of one parent in that order. */
  'not-siblings',
  /** Unwrap: the first or the last child is not an element. */
  'no-element-children',
  /** A tag that is neither a kit component nor a lowercase HTML element. */
  'unknown-component',
  /** A section of a draft that uses another kit. */
  'kit-mismatch',
  /** Reset: the element did not exist when the session started. */
  'not-in-session',
  /** A move into the element itself or into one of its descendants. */
  'into-self',
] as const;
export type Refusal = (typeof REFUSALS)[number];

/**
 * An applied operation: the new text and the ranges of the new text that changed. A refusal has
 * no text, so a caller cannot write a part of a change. `conflict`: the place is there but holds
 * another value than the op's `before` (someone else changed it); never returned with `force`.
 */
export type ApplyResult =
  | { text: string; changed: Span[] }
  | { refused: Refusal }
  | { conflict: 'changed' };

/** `force`: "keep mine", write even where the value is no longer `before`. */
export type ApplyOptions = { force: boolean };

/** A prop as written in the opening tag. `expr` is any `{…}` that is not a plain literal. */
export type PropView =
  | { name: string; kind: 'literal'; value: PropValue; span: Span }
  | { name: string; kind: 'expr'; source: string; span: Span };

/** One opening tag at a known offset (A: `readTag`). */
export type TagView = {
  /** `Button`, `Card.Header`, `div`. */
  name: string;
  /** From `<` to the end of `>` or `/>`. */
  span: Span;
  selfClosing: boolean;
  props: PropView[];
  /** `{...rest}` somewhere in the tag. */
  spread: boolean;
  /** `className`: a string literal, an expression, or none. */
  className:
    | { kind: 'string'; value: string; span: Span }
    | { kind: 'expr'; source: string; span: Span }
    | null;
  /** The one plain text child, trimmed, when the element has exactly that between its tags. */
  text: { value: string; span: Span } | null;
};

/** One declaration of a rule's own body (depth 1), as written. */
export type Declaration = {
  property: string;
  /** The value as written, without the `;` and the marker. */
  value: string;
  /** Followed by the off-kit marker. */
  offKit: boolean;
  /** From the property name to the end of the marker, or of the `;` without one. */
  span: Span;
};

/** The top-level rule `.<className>` of a section SCSS file (B: `readRule`). */
export type RuleView = {
  className: string;
  /** From the selector to the closing `}`. */
  span: Span;
  declarations: Declaration[];
  /** Properties set only inside nested blocks or media queries: read-only in 4a. */
  nested: string[];
};

/** Where a style property's value comes from (C6, spec decision 9). */
export type StyleSource =
  | { kind: 'prop'; prop: string }
  | { kind: 'scss'; className: string; value: string; offKit: boolean }
  | { kind: 'utility'; className: string }
  | { kind: 'kit' };

/** The style properties the panel shows for any element (R9). */
export const STYLE_PROPERTIES = [
  'padding',
  'padding-block',
  'padding-inline',
  'margin',
  'margin-block',
  'margin-inline',
  'gap',
  'color',
  'background-color',
  'border-color',
  'font-size',
  'font-weight',
  'line-height',
  'border-radius',
  'border-width',
  'width',
  'height',
] as const;
export type StyleProperty = (typeof STYLE_PROPERTIES)[number];

/** Which token type a property takes, for pickers and `nearestToken`. */
export const PROPERTY_TOKEN_TYPE: Record<
  StyleProperty,
  'dimension' | 'color' | 'fontWeight' | 'number'
> = {
  padding: 'dimension',
  'padding-block': 'dimension',
  'padding-inline': 'dimension',
  margin: 'dimension',
  'margin-block': 'dimension',
  'margin-inline': 'dimension',
  gap: 'dimension',
  color: 'color',
  'background-color': 'color',
  'border-color': 'color',
  'font-size': 'dimension',
  'font-weight': 'fontWeight',
  'line-height': 'number',
  'border-radius': 'dimension',
  'border-width': 'dimension',
  width: 'dimension',
  height: 'dimension',
};

/** A kit token as the editor offers it. */
export type TokenOption = {
  /** `--kit-space-md`. */
  var: string;
  /** `space.md`. */
  path: string;
  type: 'color' | 'dimension' | 'duration' | 'fontFamily' | 'fontWeight' | 'number';
  /** The value as CSS writes it: `12px`, `#1a1a1a`, `600`. */
  css: string;
};

export type { PropValue, StyleValue };
