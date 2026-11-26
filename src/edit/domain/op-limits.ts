// What an operation may hold (spec 4a, decision 5): the patterns and limits the schemas of
// `ops.ts` are built from, the states a style may be set for and the places an element may go.
// It imports nothing, so the studio page and the frame read it as it is (ADR 0080); `ops.ts`
// re-exports every name.

/** An element id as the build makes it: `sections/Pricing:section/Stack/Card.2` (render/domain/sites.ts). */
export const ELEMENT_ID =
  /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*:[A-Za-z0-9_.$-]+(?:\/[A-Za-z0-9_.$-]+)*$/;
/** A prop name as JSX writes it: `variant`, `aria-label`, `data-x`. Never `className`, `key`, `ref`. */
export const PROP_NAME = /^(?!className$|key$|ref$|style$)[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
/** A CSS class name kitvas may read or write. */
export const CLASS_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
/** A CSS property in the editor's set: lower-case, hyphens. Custom properties are never edited. */
export const CSS_PROPERTY = /^[a-z][a-z-]{0,47}$/;
/** A kit token variable: `--kit-space-md`. */
export const TOKEN_VAR = /^--kit-[A-Za-z0-9_-]{1,80}$/;

export const MAX_TEXT = 2_000;
export const MAX_RAW = 200;
/** Operations in one request: one gesture, or one undo of a gesture (a move across sections with
 * its class rules is several). */
export const MAX_OPS = 50;
/** JSX source an op carries: an inserted element, a pasted subtree, an element's whole source. */
export const MAX_SOURCE = 20_000;
/** One hunk's text in a server-made inverse, and a whole file in a `file` op. */
export const MAX_HUNK = 100_000;
export const MAX_FILE = 200_000;
/** `hashOf`: FNV-1a 64-bit, 16 lower-case hex digits. */
export const HASH = /^[0-9a-f]{16}$/;
/** A kit component tag: `Stack`, `Card.Header`. */
export const COMPONENT_TAG = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?$/;
/** A section id of the layout (the drafts module's `SECTION_ID`) and a draft slug (`SLUG`). */
export const SECTION = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const DRAFT_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
/**
 * A file inside a version that a server-made inverse may change: a section's or a sketch's TSX, a
 * section's SCSS, the layout. Never the generated `index.tsx` or `index.scss`.
 */
export const EDIT_FILE =
  /^(?:src\/tsx\/sections\/[A-Za-z0-9]+\.tsx|src\/tsx\/sketches\/[A-Za-z0-9]+\.tsx|src\/scss\/sections\/_?[a-z][a-z0-9-]*\.scss|md\/layout\.md)$/;

/**
 * The states a style may be set for (spec 4c, goal 1): written as `&:hover`, `&:focus-visible`,
 * `&:active` in SCSS, and as the `hover:`, `focus-visible:`, `active:` prefixes in Tailwind.
 */
export const STYLE_STATES = ['hover', 'focus-visible', 'active'] as const;
export type StyleState = (typeof STYLE_STATES)[number];
/** Widest breakpoint a context may name, in CSS px. */
export const MAX_BREAKPOINT = 10_000;
/** One utility class of a Tailwind draft with its prefixes: `p-4`, `md:hover:bg-ink`, `w-[13px]`. */
export const UTILITY = /^[A-Za-z0-9:_\-[\]/.#%(),]{1,120}$/;
/** The most `.map` lists around one element that a text's path names (ADR 0060). */
export const MAX_LIST_DEPTH = 8;

/** Where a moved or inserted element goes: beside the anchor, or inside it as first or last child. */
export const PLACES = ['before', 'after', 'first', 'last'] as const;
export type Place = (typeof PLACES)[number];
