// Shapes of the editor's API (plan 13, C3) and of its two events (C5). The routes are in
// `edit-routes.ts`; the rules are in the edit module.
//
// An edit request answers 200 for every well-formed request, with an `outcome`: `applied`,
// `conflict` (what a 412 would say, with the current text so the panel can offer the choice), or
// `refused`. Malformed requests, a missing draft or a stale version are errors as elsewhere.

import {
  EditOpSchema,
  ElementIdSchema,
  HASH,
  IMAGE_FILE,
  MAX_IMAGES,
  MAX_OPS,
  REFUSALS,
  STYLE_PROPERTIES,
  StyleContextSchema,
  TOKEN_VAR,
} from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';
import { LiveCodeFindingSchema } from './live-schemas.ts';

/** A path inside the version: `src/tsx/sections/Hero.tsx`, `src/scss/sections/hero.scss`. */
export const SOURCE_PATH =
  /^src\/(?:tsx|scss)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:tsx|scss)$/;
/** A file an edit may change: a source file, or the layout the section ops change (spec 4b). */
export const EDIT_PATH =
  /^(?:src\/(?:tsx|scss)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:tsx|scss)|md\/layout\.md)$/;
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
});

export const StyleSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('prop'), prop: z.string() }),
  z.strictObject({
    kind: z.literal('scss'),
    className: z.string(),
    value: z.string(),
    offKit: z.boolean(),
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

/** The query of `GET /api/v1/drafts/{slug}/inspect?id=<element id>`. */
export const InspectQuerySchema = z.strictObject({ id: ElementIdSchema });

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
   * The image files of the version's `src/img`, sorted: what a background image may name as
   * `url(../img/<file>)` (plan 15). Optional so an answer of an older studio still reads.
   */
  images: z.array(z.string().regex(IMAGE_FILE)).max(MAX_IMAGES).optional(),
  /**
   * Spec 4c, goal 9: the element is rendered by a `.map`. `literal`: over an inline array or a
   * `const` array in the same file, so its items can be edited; any other kind is read-only and
   * `reason` says why. `count`: the array's items when literal, else `null`.
   */
  list: z
    .strictObject({
      kind: z.enum(['literal', 'prop', 'import', 'computed']),
      count: z.number().int().min(0).nullable(),
      reason: z.enum(REFUSALS).nullable(),
      /** A literal list: each item's text the element shows (`{item.title}`), `null` when not a string field. */
      texts: z.array(z.string().nullable()).nullable().optional(),
    })
    .nullable()
    .optional(),
  /** The kit's breakpoints, ascending (spec 4c, goal 1; `kitBreakpoints`). */
  breakpoints: z.array(z.number().int().min(1)).optional(),
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
export type EditRequest = Zod.infer<typeof EditRequestSchema>;
export type EditOutcome = Zod.infer<typeof EditOutcomeSchema>;
export type EditEnd = Zod.infer<typeof EditEndSchema>;
export type OffKit = Zod.infer<typeof OffKitSchema>;
export type SourceEvent = Zod.infer<typeof SourceEventSchema>;
export type BuildEvent = Zod.infer<typeof BuildEventSchema>;
