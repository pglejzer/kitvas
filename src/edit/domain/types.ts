// What the pure parts of the editor read from source text and answer with (plan 13, C2 and C6).
// Offsets are UTF-16 indexes into the file's text, as JavaScript strings count them.

import type { PropValue, StyleValue } from './ops.ts';
import type { Shorthand } from './style/shorthand.ts';

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
  // Stage 4c (plan 16).
  /** A per-width or per-state value of a property a prop covers (spec 4c, goal 1). */
  'prop-covered',
  /** A width that is not one of the kit's breakpoints. */
  'not-breakpoint',
  /** A list item edit on a `.map` over anything but a literal array in the same file. */
  'list-not-literal',
  /** The list has no item at that index any more. */
  'list-item-gone',
  /** The item's text is not a string literal field of the item (`{item.title}`). */
  'list-text-not-literal',
  /** A list item edit on an element that is not the root its list's callback returns (ADR 0065). */
  'not-list-item',
  /** A utility class of a Tailwind draft that kitvas does not know how to swap. */
  'utility-unknown',
  /** The kit's own rule for this state weighs more than the editor's: the value would not show. */
  'kit-state-wins',
  /** The element, or one it would remove, is locked (spec 4d, goal 4). */
  'locked',
  /**
   * "This item" (ADR 0072): the key of the list around the element does not give each item a
   * name a class can use (not a field of the item, a value missing, repeated or no class part).
   */
  'item-key',
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

/**
 * A class rule `.<className>` of a section SCSS file (`listRules`), or all the rules of a class
 * read together, top-level and nested as `&__part` (`readRule`, ADR 0067).
 */
export type RuleView = {
  className: string;
  /** From the selector to the closing `}`. */
  span: Span;
  declarations: Declaration[];
  /** Properties set only inside nested blocks or media queries: read-only in 4a. */
  nested: string[];
};

/**
 * Where a style property's value comes from (C6, spec decision 9). `via`: the shorthand of the
 * class rule that holds the value (`border` for a `border-color`), with `value` and `offKit` those
 * of its part (ADR 0070); left out for the property's own declaration.
 */
export type StyleSource =
  | { kind: 'prop'; prop: string }
  | { kind: 'scss'; className: string; value: string; offKit: boolean; via?: Shorthand }
  | { kind: 'utility'; className: string }
  | { kind: 'kit' };

/**
 * The style properties the panel shows for any element (R9). The first seventeen are stage 4a's,
 * in their order; plan 15 adds each side of padding and margin, the layout keywords, the outline
 * and the background image; ADR 0067 the minimum width and height, the size a "target too small"
 * fix writes. The frame reads the computed styles of this list (`client/frame/edit/tree.ts`) and
 * the panel shows its rows (`client/studio/edit/props/values/steps.ts`): this file imports types only,
 * so both take it as it is (ADR 0080).
 */
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
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'display',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-self',
  'text-align',
  'border-style',
  'outline-color',
  'outline-width',
  'outline-style',
  'background-image',
  'background-size',
  'min-width',
  'min-height',
] as const;
export type StyleProperty = (typeof STYLE_PROPERTIES)[number];

/** The token types a style property may take. */
export type StyleTokenType = 'dimension' | 'color' | 'fontWeight' | 'number';
/**
 * What a style property's value is (plan 15): a kit token of a type (or a raw value marked
 * off-kit), one keyword of a fixed list, or an image file of the version.
 */
export type StyleKind = StyleTokenType | 'keyword' | 'image';

/** The token type a property takes, for pickers and `nearestToken`. Keywords and images take none. */
export const PROPERTY_TOKEN_TYPE = {
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
  'padding-top': 'dimension',
  'padding-right': 'dimension',
  'padding-bottom': 'dimension',
  'padding-left': 'dimension',
  'margin-top': 'dimension',
  'margin-right': 'dimension',
  'margin-bottom': 'dimension',
  'margin-left': 'dimension',
  'outline-color': 'color',
  'outline-width': 'dimension',
  'min-width': 'dimension',
  'min-height': 'dimension',
} as const satisfies Partial<Record<StyleProperty, StyleTokenType>>;
export type TokenProperty = keyof typeof PROPERTY_TOKEN_TYPE;

/**
 * The words each keyword property takes (plan 15), in the order the panel offers them. A keyword
 * is never a token and never off-kit: it is written without the marker. Any other word is refused
 * (`invalid`).
 */
export const STYLE_KEYWORDS = {
  display: ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'none'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap'],
  'justify-content': [
    'flex-start',
    'center',
    'flex-end',
    'space-between',
    'space-around',
    'space-evenly',
  ],
  'align-items': ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
  'align-self': ['auto', 'stretch', 'flex-start', 'center', 'flex-end'],
  'text-align': ['left', 'center', 'right', 'justify'],
  'border-style': ['none', 'solid', 'dashed', 'dotted'],
  'outline-style': ['none', 'solid', 'dashed', 'dotted'],
  'background-size': ['auto', 'cover', 'contain'],
} as const satisfies Partial<Record<StyleProperty, readonly string[]>>;
export type KeywordProperty = keyof typeof STYLE_KEYWORDS;

/** Every property's kind: its token type, `keyword`, or `image` (only `url(../img/<file>)`). */
export const PROPERTY_KIND: Record<StyleProperty, StyleKind> = {
  ...PROPERTY_TOKEN_TYPE,
  display: 'keyword',
  'flex-direction': 'keyword',
  'flex-wrap': 'keyword',
  'justify-content': 'keyword',
  'align-items': 'keyword',
  'align-self': 'keyword',
  'text-align': 'keyword',
  'border-style': 'keyword',
  'outline-style': 'keyword',
  'background-size': 'keyword',
  'background-image': 'image',
};

export const isStyleProperty = (property: string): property is StyleProperty =>
  Object.hasOwn(PROPERTY_KIND, property);

export const isTokenProperty = (property: string): property is TokenProperty =>
  Object.hasOwn(PROPERTY_TOKEN_TYPE, property);

export const isKeywordProperty = (property: string): property is KeywordProperty =>
  Object.hasOwn(STYLE_KEYWORDS, property);

/** The kind of a property of the editor's set; `null` for any other property. */
export const kindOf = (property: string): StyleKind | null =>
  isStyleProperty(property) ? PROPERTY_KIND[property] : null;

/** The token type a property takes; `null` for a keyword, an image or a property not in the set. */
export const tokenTypeOf = (property: string): StyleTokenType | null =>
  isTokenProperty(property) ? PROPERTY_TOKEN_TYPE[property] : null;

/** The words a keyword property takes; `null` for any other property. */
export function keywordsOf(property: string): readonly string[] | null {
  if (!isKeywordProperty(property)) return null;
  const words: readonly string[] = STYLE_KEYWORDS[property];
  return words;
}

/** A kit token as the editor offers it. */
export type TokenOption = {
  /** `--kit-space-12`. */
  var: string;
  /** `space.md`. */
  path: string;
  type: 'color' | 'dimension' | 'duration' | 'fontFamily' | 'fontWeight' | 'number';
  /** The value as CSS writes it: `12px`, `#1a1a1a`, `600`. */
  css: string;
  /** The token comes from the project's additions, not from the design system (plan 25, C8). */
  added?: boolean | undefined;
  /**
   * The theme key the kit maps the token onto (`css-var-map.json`), as a Tailwind utility names it
   * (plan 29): `--color-primary` is `color`/`primary`, `theme(borderRadius.md)` is
   * `borderRadius`/`md`. Only through it is the token a named class (`themeKeyOf`).
   */
  utility?: { namespace: string; name: string } | undefined;
};

export type { PropValue, StyleValue };
