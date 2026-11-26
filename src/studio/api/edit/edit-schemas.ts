// Shapes of the editor's API (plan 13, C3) and of its two events (C5). The routes are in
// `edit-routes.ts`; the rules are in the edit module.
//
// An edit request answers 200 for every well-formed request, with an `outcome`: `applied`,
// `conflict` (what a 412 would say, with the current text so the panel can offer the choice), or
// `refused`. Malformed requests, a missing draft or a stale version are errors as elsewhere.

import {
  CLASS_NAME,
  EditOpSchema,
  ElementIdSchema,
  HASH,
  IMAGE_FILE,
  MAX_IMAGES,
  MAX_LIST_DEPTH,
  MAX_OPS,
  MAX_TEXT,
  REFUSALS,
  SHORTHANDS,
  STYLE_PROPERTIES,
  StyleContextSchema,
  TOKEN_VAR,
} from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';
import { LiveCodeFindingSchema } from './live-schemas.ts';

/** A path inside the version: `src/tsx/sections/Hero.tsx`, `src/scss/sections/hero.scss`. */
export const SOURCE_PATH =
  /^src\/(?:tsx|scss)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:tsx|scss)$/;
/**
 * A file an edit may change: a source file, the layout the section ops change (spec 4b), or the
 * options file "Make default" and its Undo write (plan 25).
 */
export const EDIT_PATH =
  /^(?:src\/(?:tsx|scss)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:tsx|scss)|md\/layout\.md|src\/json\/options\.json)$/;
/** A strong ETag as `etagOf` writes it (http/etag.ts). */
export const ETAG = /^"[A-Za-z0-9_-]{27}"$/;

const SourcePath = z.string().regex(SOURCE_PATH);
const EditPath = z.string().regex(EDIT_PATH);
const Etag = z.string().regex(ETAG);
/** ETags of a version's source files, by path. */
export const EtagsSchema = z.record(EditPath, Etag);
const Version = z.number().int().min(1);

const PropValue = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('string'), value: z.string() }),
  z.strictObject({ kind: z.literal('number'), value: z.number() }),
  z.strictObject({ kind: z.literal('boolean'), value: z.boolean() }),
]);

export const TokenOptionSchema = z.strictObject({
  var: z.string().regex(TOKEN_VAR),
  path: z.string(),
  type: z.enum(['color', 'dimension', 'duration', 'fontFamily', 'fontWeight', 'number']),
  css: z.string(),
  added: z.boolean().optional(),
});

export const StyleSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('prop'), prop: z.string() }),
  z.strictObject({
    kind: z.literal('scss'),
    className: z.string(),
    value: z.string(),
    offKit: z.boolean(),
    /**
     * The shorthand of the class rule that holds the value (ADR 0070): `value` and `offKit` are
     * then those of its part, and an edit writes that part. Left out for the property's own
     * declaration.
     */
    via: z.enum(SHORTHANDS).optional(),
  }),
  z.strictObject({ kind: z.literal('utility'), className: z.string() }),
  z.strictObject({ kind: z.literal('kit') }),
]);

/** `GET /api/v1/drafts/{slug}/edits`: what the editor needs before the first edit. */
export const EditStateSchema = z.strictObject({
  slug: z.string(),
  /** The latest version: the one the editor shows and edits. */
  version: Version,
  /** The open editing session: edits go into `version`. `null`: the next edit starts a version. */
  session: z.strictObject({ version: Version, startedAt: z.string() }).nullable(),
  /** `tailwind` when the kit has `runtime.styles.tailwind`: styles are read-only in 4a. */
  format: z.enum(['scss', 'tailwind']),
  etags: EtagsSchema,
  /** The kit's tokens, for the pickers and the steppers. */
  tokens: z.array(TokenOptionSchema),
});

/** A copy's place in each `.map` around an element, outer first (ADR 0060). */
const PathSchema = z.array(z.number().int().min(0).max(10_000)).max(MAX_LIST_DEPTH);

/**
 * The query of `GET /api/v1/drafts/{slug}/inspect?id=<element id>&path=0,2`. `path` (ADR 0065):
 * the rendered copy the answer's `list` is read for; left out, the list is read for no one copy.
 * `scope=item` (ADR 0072): the answer is read for that copy's own class, so it needs `path`.
 */
export const InspectQuerySchema = z
  .strictObject({
    id: ElementIdSchema,
    path: PathSchema.optional(),
    scope: z.literal('item').optional(),
  })
  .superRefine((query, issues) => {
    if (query.scope !== undefined && query.path === undefined) {
      issues.addIssue({ code: 'custom', path: ['path'], message: 'scope=item needs a path' });
    }
  });

/**
 * The query of `GET /api/v1/drafts/{slug}/text-source?id=…&text=…&path=0,2` (ADR 0060): the
 * element, the text its copy shows as the frame read it, and the copy's path (`path=` for none).
 */
export const TextSourceQuerySchema = z.strictObject({
  id: ElementIdSchema,
  text: z.string().max(MAX_TEXT),
  path: PathSchema,
});

/** Whether that text has one string literal of the file behind it: `reason: null` when it has. */
export const TextSourceSchema = z.strictObject({ reason: z.enum(REFUSALS).nullable() });

/** `GET /api/v1/drafts/{slug}/inspect`: one element as its source writes it. */
export const InspectSchema = z.strictObject({
  id: z.string(),
  version: Version,
  file: SourcePath,
  etag: Etag,
  /** The JSX tag: `Button`, `Card.Header`, `div`. */
  tag: z.string(),
  /** The kit component it is, with its catalog props; `null` for a plain element. */
  component: z
    .strictObject({
      name: z.string(),
      takesClassName: z.boolean(),
      props: z.array(
        z.strictObject({
          name: z.string(),
          type: z.string(),
          values: z.array(z.string()).optional(),
          default: z.union([z.string(), z.number(), z.boolean()]).optional(),
        }),
      ),
    })
    .nullable(),
  /** The props as written: a literal can be edited, an expression is read-only (decision 4). */
  props: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({ name: z.string(), kind: z.literal('literal'), value: PropValue }),
      z.strictObject({ name: z.string(), kind: z.literal('expr'), source: z.string() }),
    ]),
  ),
  spread: z.boolean(),
  /** The one plain text child; `null` with the reason when there is none. */
  text: z.string().nullable(),
  textRefusal: z.enum(REFUSALS).nullable(),
  className: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('string'), value: z.string() }),
      z.strictObject({ kind: z.literal('expr'), source: z.string() }),
    ])
    .nullable(),
  /**
   * The class a style edit writes: the element's first class with a rule, else its first class,
   * else a new name free in both files (then the edit starts with `addClass`).
   */
  styleClass: z.strictObject({ className: z.string(), exists: z.boolean() }).nullable(),
  /** The section SCSS file and the rule of `styleClass`; `null` when the section has no SCSS file. */
  scss: z
    .strictObject({
      file: SourcePath,
      etag: Etag,
      /** The rule `.styleClass` exists: a first `setStyle` has `newRule: false`. */
      rule: z.boolean(),
      declarations: z.array(
        z.strictObject({ property: z.string(), value: z.string(), offKit: z.boolean() }),
      ),
      nested: z.array(z.string()),
    })
    .nullable(),
  /** Where each style property's value comes from (C6). */
  styles: z.record(z.enum(STYLE_PROPERTIES), StyleSourceSchema),
  /** `hashOf` the element's whole source: structural ops carry it (spec 4b, decision 5). */
  hash: z.string().regex(HASH),
  /** Why the element cannot be moved or deleted as an element; `null` when it can. */
  movable: z.enum(REFUSALS).nullable(),
  /** The 1-based line of the element's `<` in `file`, for the panel's header (plan 15). */
  line: z.number().int().min(1).optional(),
  /**
   * Plan 18f (spec S4.6, the Source strip): the opening tag as one line (white space joined, at
   * most 200 characters), and the file and 1-based line where the element's class rule starts;
   * `null` for both when it has no rule. Optional so an answer of an older studio still reads.
   */
  source: z
    .strictObject({
      tag: z.string().max(200),
      ruleFile: SourcePath.nullable(),
      ruleLine: z.number().int().min(1).nullable(),
    })
    .optional(),
  /**
   * The image files of the version's `src/img`, sorted: what a background image may name as
   * `url(../img/<file>)` (plan 15). Optional so an answer of an older studio still reads.
   */
  images: z.array(z.string().regex(IMAGE_FILE)).max(MAX_IMAGES).optional(),
  /**
   * Spec 4c, goal 9: the element is rendered by a `.map`. `literal`: over an inline array or a
   * `const` array in the same file, so its items can be edited; any other kind is read-only and
   * `reason` says why. `count`: the array's items when literal, else `null`. A list inside
   * another list is read for the copy the query's `path` names (ADR 0065): `literal` with the
   * items of that copy's own array; asked without a path, `literal` with `count: null`.
   */
  list: z
    .strictObject({
      kind: z.enum(['literal', 'prop', 'import', 'computed']),
      count: z.number().int().min(0).nullable(),
      reason: z.enum(REFUSALS).nullable(),
      /** A literal list: each item's text the element shows (`{item.title}`), `null` when not a string field. */
      texts: z.array(z.string().nullable()).nullable().optional(),
      /**
       * The element is the list's item: the root its innermost list's callback returns. `false`:
       * a part of an item, an element of the template every item shares.
       */
      root: z.boolean().optional(),
      /**
       * Asked with a `path`: the place of that copy of the item among all the copies the list
       * renders, in page order, and how many the arrays hold; `null` when one is not read.
       */
      copy: z.number().int().min(0).nullable().optional(),
      copies: z.number().int().min(0).nullable().optional(),
    })
    .nullable()
    .optional(),
  /** The kit's breakpoints, ascending (spec 4c, goal 1; `kitBreakpoints`). */
  breakpoints: z.array(z.number().int().min(1)).optional(),
  /**
   * Spec 4d, goal 6: plain JSX a kit component covers. `source`: the element's source with the
   * component's tag, its children and the props both take kept (sent as `replaceElement`, which
   * adds the kit import); `dropped`: what the component does not take. `null`: nothing to suggest.
   */
  suggest: z
    .strictObject({
      component: z.string().max(80),
      source: z.string().max(20_000),
      dropped: z.array(z.string().max(80)).max(40),
    })
    .nullable()
    .optional(),
  /**
   * ADR 0060: the element shows text through `{…}` (text and expressions, no element), so a
   * double click asks `text-source` first. `roots`: the ids of the root elements of the `.map`
   * lists around it, outer first, by whose copies the frame counts the path; `null` when a list
   * around it has no such root. `null`: no such text.
   */
  expression: z
    .strictObject({ roots: z.array(ElementIdSchema).max(MAX_LIST_DEPTH).nullable() })
    .nullable()
    .optional(),
  /**
   * ADR 0072, asked with `scope=item` and a copy's `path`: the item's own class
   * (`plans__card--pro`) this answer is read for. `styleClass` is that class (`exists: true`),
   * `scss` and `overrides` are its rules (`rule: false` when it has none yet), and each of
   * `styles` is the item rule's where it sets the property, else the value every item shares,
   * with its class and without `via`. `inTsx`: the element's `className` gives the modifier
   * already; when not, a style edit starts with `addItemClass`. `refused`: why the item can have
   * no class of its own. `null`: not asked.
   */
  itemScope: z
    .union([
      z.strictObject({
        className: z.string().regex(CLASS_NAME),
        inTsx: z.boolean(),
        path: PathSchema,
      }),
      z.strictObject({ refused: z.enum(REFUSALS) }),
    ])
    .nullable()
    .optional(),
  /**
   * Every value the element's rule sets for a width or a state (spec 4c): a nested block of the
   * SCSS rule, or a prefixed utility of a Tailwind draft. The base values stay in `styles`.
   */
  overrides: z
    .array(
      z.strictObject({
        context: StyleContextSchema,
        property: z.enum(STYLE_PROPERTIES),
        value: z.string(),
        offKit: z.boolean(),
        /** Tailwind: the prefixed utility that sets it (`md:p-6`); `null` in SCSS. */
        utility: z.string().nullable(),
        /** SCSS: the shorthand of the block that holds the value, as in `styles` (ADR 0070). */
        via: z.enum(SHORTHANDS).optional(),
      }),
    )
    .optional(),
});

/** `POST /api/v1/drafts/{slug}/edits`. */
export const EditRequestSchema = z.strictObject({
  /** The version the editor shows; it must be the latest. */
  version: Version,
  ops: z.array(EditOpSchema).min(1).max(MAX_OPS),
  /** ETags of the files the ops were made from, as the editor last heard them. */
  etags: EtagsSchema,
  /**
   * "Keep mine" after a conflict: write the ops on the current text even where the value there is
   * no longer `before`. A place that is gone is still refused.
   */
  force: z.boolean().optional(),
});

export const EditOutcomeSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('applied'),
    version: Version,
    /** This request started `version` (the first edit of a session). */
    started: z.boolean(),
    /** New ETags of the files it wrote. */
    etags: EtagsSchema,
    /** A file had changed since `etags`; the ops were placed again by their element ids. */
    merged: z.boolean(),
    /**
     * The exact inverse, in the ids after this request (spec 4b, decision 4): the 4a inverses for
     * a request of 4a ops only, else `patch` and `file` ops, one per changed file. Undo sends it.
     */
    inverse: z.array(EditOpSchema).max(MAX_OPS),
    /** Old id → new id of every element whose id this request changed (decision 7). */
    renames: z.record(ElementIdSchema, ElementIdSchema),
    /** Ids of the elements this request created: an insert's, a paste's, a wrap's new parent. */
    created: z.array(ElementIdSchema),
    /** Props a `replaceTag` dropped because the new component has none of that name. */
    dropped: z.array(z.string()),
    /** Spec 4c, goal 5: the code findings of the files this request changed. */
    live: z.array(LiveCodeFindingSchema).optional(),
  }),
  z.strictObject({
    outcome: z.literal('conflict'),
    version: Version,
    /** Index of the first op that met a change by someone else. */
    index: z.number().int().min(0),
    /** `changed`: the place holds another value than `before`. `gone`: the place is not there. */
    reason: z.enum(['changed', 'gone']),
    file: EditPath,
    text: z.string(),
    etag: Etag,
  }),
  z.strictObject({
    outcome: z.literal('refused'),
    version: Version,
    refusals: z
      .array(z.strictObject({ index: z.number().int().min(0), reason: z.enum(REFUSALS) }))
      .min(1),
  }),
]);

/** `POST /api/v1/drafts/{slug}/edits/end`: "Save version". */
export const EditEndSchema = z.strictObject({ version: Version, ended: z.boolean() });

/** `GET /api/v1/drafts/{slug}/off-kit`: raw values in the latest version's SCSS (task J). */
export const OffKitSchema = z.strictObject({
  version: Version,
  items: z.array(
    z.strictObject({
      file: SourcePath,
      className: z.string(),
      property: z.string(),
      value: z.string(),
      /** The nearest kit token of the property's type; `null` when the kit has none or the value is not one. */
      nearest: TokenOptionSchema.nullable(),
    }),
  ),
});

/** Event `source`: a draft's source files changed on disk, by the editor or by anyone else. */
export const SourceEventSchema = z.strictObject({
  slug: z.string(),
  version: Version,
  files: EtagsSchema,
  /** `editor`: every file matches a write of the edit API; `other`: Claude, or anyone. */
  by: z.enum(['editor', 'other']),
});

/** Event `build`: the studio's own build of a draft ended (task E). */
export const BuildEventSchema = z.strictObject({
  slug: z.string(),
  version: Version,
  state: z.enum(['succeeded', 'failed']),
  ms: z.number().int().min(0),
});

export type EditState = Zod.infer<typeof EditStateSchema>;
export type Inspect = Zod.infer<typeof InspectSchema>;
export type TextSource = Zod.infer<typeof TextSourceSchema>;
export type EditRequest = Zod.infer<typeof EditRequestSchema>;
export type EditOutcome = Zod.infer<typeof EditOutcomeSchema>;
export type EditEnd = Zod.infer<typeof EditEndSchema>;
export type OffKit = Zod.infer<typeof OffKitSchema>;
export type SourceEvent = Zod.infer<typeof SourceEventSchema>;
export type BuildEvent = Zod.infer<typeof BuildEventSchema>;
