// The kit contract: what kit.json may contain. One schema, the types derive from it.

import { KitvasError, OPTION_VALUE, type Zod, z } from '../../shared/index.ts';

export const PROP_TYPES = [
  'enum',
  'boolean',
  'string',
  'number',
  'node',
  'element',
  'component',
  'callback',
  'object',
  'union',
] as const;

export const CATEGORIES = [
  'action',
  'input',
  'layout',
  'typography',
  'display',
  'feedback',
  'overlay',
  'navigation',
  /** A single icon, such as one crafted into the project's additions (spec 3b, 6.4). */
  'icon',
] as const;

const kitId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const componentName = z.string().regex(/^[A-Z][A-Za-z0-9]*$/);
/** A path inside the kit folder: relative, forward slashes, no `..`. */
const relPath = z.string().regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/);
const text = z.string().min(1);

/**
 * An npm package name with an optional subpath: `@mui/material`, `@mui/material/Button`, `clsx`.
 * No subpath segment is `.` or `..`, so a specifier never leaves the package.
 */
export const PACKAGE_SPECIFIER =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~-]+)*$/;
/**
 * A path inside the person's project, from its root: `src/components/ui`, `src/theme.ts`. Forward
 * slashes, no leading slash or `./`, no `..`, no drive letter, no `node_modules`.
 */
export const PROJECT_PATH =
  /^(?!\/)(?!\.\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*:)(?!(?:.*\/)?node_modules(?:\/|$))[A-Za-z0-9_@.\-/[\]()]+$/;

/**
 * What a written kit's `import.from` and `runtime.styles.imports` name: a file of its own
 * `components/` folder, `components/Button` or `components/base.css`.
 */
export const KIT_PATH = /^components\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.(?:tsx|ts|css))?$/;
/** An image inside the kit's `source/` folder that an example should look like. */
export const REFERENCE_PATH =
  /^(?!.*\.\.)source\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/;
/** A Figma design file: `https://www.figma.com/design/<key>/<name>?node-id=…`. */
export const FIGMA_URL =
  /^https:\/\/(?:www\.)?figma\.com\/(?:design|file)\/[0-9A-Za-z]{22,128}(?:[/?#][^\s]*)?$/;
/** A web page to scan: http or https, a host without user info. Addresses are checked when scanned. */
export const WEB_URL = /^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/;
/** A copy of an example's original markup inside a `code` kit: `originals/Button.1.html`. */
export const ORIGINAL_PATH = /^originals\/[A-Za-z0-9_-]+\.[1-9][0-9]*\.html$/;

/**
 * A name the project's bundler puts in place of a folder or a file: `@`, `~`, `@app`, `components`.
 * No `*`, no `.` or `/` in front, no `/` at the end.
 */
export const ALIAS_NAME = /^(?![./])[A-Za-z0-9_@~#$.\-/]+(?<!\/)$/;

const packageName = z.string().regex(PACKAGE_SPECIFIER);
const projectPath = z.string().regex(PROJECT_PATH);

const importSchema = z.strictObject({
  from: text,
  name: text.optional(),
  default: z.boolean().optional(),
});

// The parts below are exported by name: `scripts/kit-schema.ts` names them under `$defs` of
// `reference/kit.schema.json`, and `kit merge` checks a fragment's components and gaps with them.

export const PropSchema = z.strictObject({
  name: text,
  type: z.enum(PROP_TYPES),
  values: z.array(z.string()).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  required: z.boolean().optional(),
  responsive: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  description: z.string().optional(),
});

/** A controlled pair of props: `value` holds the state, `onChange` sets it. */
export const StateEntrySchema = z.strictObject({
  value: text,
  default: text.optional(),
  onChange: text,
});

/** An attribute of an element of the app's shell: never an event handler. */
const shellAttributes = z.record(
  z.string().regex(/^(?!on)[a-z_:][a-z0-9_.:-]*$/i),
  z.string().max(2000),
);

/** Elements of the app around a component, from the outside in; kitvas gives them no box. */
const wrappersSchema = z
  .array(
    z.strictObject({
      /** A plain container, or a custom element (a name with a hyphen). */
      tag: z
        .string()
        .regex(
          /^(?:div|main|section|article|aside|header|footer|nav|form|span|[a-z][a-z0-9]*-[a-z0-9-]*)$/,
        )
        .default('div'),
      attributes: shellAttributes.default({}),
    }),
  )
  .max(6);

export const ExampleSchema = z.strictObject({
  title: text,
  code: text,
  imports: z.array(componentName),
  /** Written kits: the image this example should look like (`kit verify`, step `look`). */
  reference: z.string().regex(REFERENCE_PATH).optional(),
  /** `code` kits: the original's own markup for this example. */
  original: z.string().regex(ORIGINAL_PATH).optional(),
  /**
   * `code` kits: the elements of the app's page this example's component stands in, inside the
   * shell, whose rules reach it (`.article-page .card`); the original is drawn inside them.
   */
  around: wrappersSchema.optional(),
});

/** Where a `code` kit's component comes from in the project: its files or a library, never both. */
const projectOriginSchema = z.strictObject({
  files: z.array(projectPath).min(1).max(12).optional(),
  package: text.optional(),
  /** The selector, tag or class the project writes. */
  name: text.optional(),
  /** The files that style it. */
  styles: z.array(projectPath).max(12).default([]),
  /** Those styles reach only the component's own markup. */
  scoped: z.boolean().default(false),
});

export const ComponentSchema = z.strictObject({
  name: componentName,
  category: z.enum(CATEGORIES),
  description: text,
  import: importSchema,
  parts: z.array(componentName).default([]),
  polymorphic: z.strictObject({ prop: text }).optional(),
  styling: z.array(text).default([]),
  props: z.array(PropSchema),
  state: z.array(StateEntrySchema).default([]),
  examples: z.array(ExampleSchema).default([]),
  a11y: z.array(text).default([]),
  deprecated: z.boolean().default(false),
  /** `code` kits: where the project has this component. */
  project: projectOriginSchema.optional(),
});

export const GAP_REASONS = ['missing', 'unsupported', 'unverified'] as const;

/** Something of the design system the kit does not hold: a component name or a prop path. */
export const GapSchema = z.strictObject({ path: text, reason: z.enum(GAP_REASONS) });

const runtimeSchema = z.strictObject({
  packages: z.array(z.strictObject({ name: text, version: text })).default([]),
  entry: relPath,
  styles: z.strictObject({
    files: z.array(relPath).default([]),
    generated: z.enum(['none', 'runtime-css']).default('none'),
    /** Style files the system needs globally: package specifiers or project paths. */
    imports: z.array(text).default([]),
    /** Tailwind v4: the project's stylesheet with `@import "tailwindcss"` and its `@theme`. */
    tailwind: z.strictObject({ entry: projectPath }).optional(),
  }),
  providers: z
    .array(
      z.strictObject({
        import: importSchema,
        /** Props with fixed string values. */
        props: z.record(z.string(), z.string()).default({}),
        /** Props whose value is an export of a module: `{ "theme": { "from": "src/theme", "name": "theme" } }`. */
        bindings: z.record(z.string(), z.strictObject({ from: text, name: text })).default({}),
      }),
    )
    .default([]),
  clientOnly: z.boolean().default(false),
});

/**
 * What a theme may put on the page's body for the design system's own switch (ADR 0083): `class`
 * or a `data-…` name.
 */
export const THEME_ATTRIBUTE = /^(?:class|data-[a-z][a-z0-9-]*)$/;

/** A theme id is a value of the option `theme`: `data-opt-theme="dark"`. */
const themeId = z.string().regex(OPTION_VALUE);

const themeSchema = z.strictObject({
  id: themeId,
  label: text,
  /** Only the tokens whose values differ from the base, at its paths. The default theme has none. */
  file: relPath.optional(),
  /** Set on `<body>` while the theme shows. The default theme has none. */
  attributes: z.record(z.string().regex(THEME_ATTRIBUTE), z.string()).optional(),
});

const tokensSchema = z.strictObject({
  file: relPath,
  format: z.literal('dtcg-2025.10'),
  /** The kit's themes; the default one is the base token file (`file`). */
  themes: z.strictObject({ default: themeId, list: z.array(themeSchema).min(1) }).optional(),
  cssVars: z.strictObject({ prefix: text, map: relPath }).optional(),
});

const iconsSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('component'),
    component: componentName,
    names: z.array(text),
  }),
  z.strictObject({
    source: z.literal('package'),
    package: text,
    pattern: z.enum(['named-import']),
    importPath: text,
    searchable: z.boolean(),
  }),
]);

/**
 * How the project's own code finds its files and types, where the project's build configuration
 * says so and its tsconfig.json does not (ADR 0092). Every path is a project path.
 */
const resolveSchema = z.strictObject({
  /** Folders an import without `./` starts from, in scripts and in Sass: `["src"]`. */
  roots: z.array(projectPath).default([]),
  /** Names the bundler puts in place of a folder or a file: `{ "@": "src" }`. */
  alias: z.record(z.string().regex(ALIAS_NAME), projectPath).default({}),
  /** Type files, or folders of them, that nothing imports and the tsconfig does not take in. */
  types: z.array(projectPath).default([]),
});

/**
 * What the app has around every component and its styles depend on: the attributes of its
 * `<html>` and `<body>` (a theme class, a `data-theme`) and the elements between the body and a
 * component, from the outside in. An original is drawn inside it. Only what a component inherits
 * counts: kitvas gives these elements no box of their own.
 */
const shellSchema = z.strictObject({
  html: shellAttributes.default({}),
  body: shellAttributes.default({}),
  wrappers: wrappersSchema.default([]),
});

export const KitSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: kitId,
  name: text,
  version: text,
  source: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('builtin') }),
    /** A package in the project's `node_modules`, with the version installed when it was learned. */
    z.strictObject({ type: z.literal('npm'), package: packageName, version: text }),
    /** A folder of the project's own components. */
    z.strictObject({ type: z.literal('repo'), path: projectPath }),
    /** Written by an agent from a Figma file the person opens through their own Figma MCP. */
    z.strictObject({ type: z.literal('figma'), url: z.string().regex(FIGMA_URL) }),
    /** Written by an agent from pages kitvas scanned. */
    z.strictObject({
      type: z.literal('web'),
      urls: z.array(z.string().regex(WEB_URL)).min(1).max(5),
    }),
    /** Written by an agent from images the person gave, copied into `source/images/`. */
    z.strictObject({ type: z.literal('images') }),
    /** Written by an agent from the code of a project folder, in any technology. */
    z.strictObject({
      type: z.literal('code'),
      path: projectPath,
      /** Style files drawn with every original, in order. */
      styles: z.array(projectPath).max(12).default([]),
      shell: shellSchema.optional(),
      /** Pages for `kit scan`. */
      urls: z.array(z.string().regex(WEB_URL)).max(5).default([]),
    }),
  ]),
  framework: z.literal('react'),
  runtime: runtimeSchema,
  resolve: resolveSchema.optional(),
  tokens: tokensSchema,
  components: z.array(ComponentSchema).min(1),
  icons: iconsSchema.optional(),
  /**
   * The widths (CSS px, ascending) from which the kit's layout changes, for per-width values
   * (spec 4c). Without them the editor uses 768 and 1280, the studio's preset widths.
   */
  breakpoints: z.array(z.number().int().min(200).max(4000)).min(1).max(4).optional(),
  gaps: z.array(GapSchema).default([]),
});

export type Kit = Zod.infer<typeof KitSchema>;
export type KitComponent = Kit['components'][number];
export type KitSource = Kit['source'];
/** A kit whose components an agent wrote into its `components/` folder. */
export type WrittenSource = Extract<KitSource, { type: 'figma' | 'web' | 'images' | 'code' }>;

/**
 * Only the `source` of a kit.json, for commands that run before the kit is complete: `kit scan`
 * reads the pages of a kit whose components the tailor agent has not written yet.
 */
export function parseKitSource(raw: unknown, id: string): KitSource {
  const parsed = z.object({ source: KitSchema.shape.source }).safeParse(raw);
  if (parsed.success) return parsed.data.source;
  const first = parsed.error.issues[0];
  const where = first?.path.join('.') || 'kit.json';
  throw new KitvasError('KIT_INVALID', { id, detail: `${where}: ${first?.message ?? ''}` });
}

/**
 * Only the `resolve` of a kit.json, for `kit exports`, which reads a kit before it is complete.
 * `undefined` for a kit without one, and for one the contract refuses (`kit verify` says why).
 */
export function parseKitResolve(raw: unknown): Kit['resolve'] {
  const parsed = z.object({ resolve: resolveSchema.optional() }).safeParse(raw);
  return parsed.success ? parsed.data.resolve : undefined;
}

/** How many of the contract's complaints a refused kit.json names, so one verify run shows most of them. */
const LISTED_ISSUES = 5;

/**
 * Checks raw JSON against the contract. `id` is only used to name the kit in the error, whose detail
 * names up to five places, the first one first: `gaps.0: Unrecognized key: "note"; components.2.props: …`.
 */
export function parseKit(raw: unknown, id: string): Kit {
  const parsed = KitSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .slice(0, LISTED_ISSUES)
    .map((issue) => `${issue.path.map(String).join('.') || 'kit.json'}: ${issue.message}`)
    .join('; ');
  throw new KitvasError('KIT_INVALID', { id, detail });
}
