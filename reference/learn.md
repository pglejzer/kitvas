# Rules for learners

Read by the `learner` agent before it writes a kit. Each rule has an id; reports cite it. These rules are for kits learned from code (an npm package or a folder). A kit written from Figma, a website or screenshots follows `write-kit.md` instead; it reuses the token rules L21 to L24 and the prop type rules L9 to L11.

## Contents

- Where you write (L1 to L4)
- Core set (L5 to L7)
- Props (L8 to L14)
- Imports (L15 to L17)
- Examples and notes (L18 to L20)
- Tokens (L21 to L24c)
- css-var-map.json (L25 to L27)
- Providers and theme (L28 to L31a)
- Themes (L31b to L31g)
- Tailwind (L32 to L35a)
- How the project finds its files (L35b to L35d)
- Findings from `kit verify` (L36 to L37)
- Report (L38)

## Where you write

- L1: Write only inside the kit folder given in your prompt: `kit.json`, `json/tokens.json`, `json/css-var-map.json`, a theme's token file (L31c), `theme.ts` in the case of L31e, and a fragment file when the prompt names one (L8b). Never write `generated/`: kitvas writes it. Never edit the project's own files or the packages.
- L2: Keep the fields `kit new` wrote (`id`, `source`, `runtime.entry`, `runtime.packages`). Change them only when a rule below says so.
- L3: Never invent. Every component, prop, value, token and class name comes from a file you read (a `.d.ts`, a source file, a docs page, a token file). When you cannot read it, add it to `gaps`.
- L4: Never paste long text from docs. Write one plain sentence per description, in your own words.

## Core set

- L5: "The core" means about 25 to 30 components, by category: `action` (Button, IconButton, Link), `input` (text field, select, checkbox, radio, switch, textarea), `layout` (Stack, Grid, Box, Container, Divider), `typography` (Heading, Text), `display` (Card, Badge, Avatar, Table, List), `feedback` (Alert, Spinner, Progress, Skeleton), `overlay` (Dialog, Menu, Tooltip, Popover), `navigation` (Tabs, Breadcrumbs, Pagination).
- L6: A request names components: do those, and only those. The rest of the core stays as it is.
- L7: A component that needs a framework (Next.js only, a server setup) goes to `gaps` with `unsupported`. One you could not check goes to `gaps` with `unverified`. A component that exists but is not in this pass is not listed by memory: `kitvas kit exports` lists what the package offers and the kit lacks. `missing` is only for a part of a component you wrote (a prop path such as `Button.loading`). A `gaps` path is the component name, or a prop path such as `Button.loading`. An entry has these two keys and no other: `{ "path": "Tabs", "reason": "missing" }`. A remark goes in your reply, never in kit.json.

## Props

- L8a: The exact shapes are in `reference/kit.schema.json` (`$defs.component`, `prop`, `example`, `stateEntry`, `gap`). Read it before you write. The rules here explain it and never replace it; when they differ, the schema file wins.
- L8b: When your prompt names a fragment file (`<kit>/parts/<name>.json`), write only that file and never `kit.json`. Its shape is `{ "components": [ … ], "gaps": [ … ] }`: component entries and gap entries as in `kit.json`, no other key (`gaps` may be left out). Cover only the names you were given. kitvas merges the fragments.
- L8: Read props from the package's `.d.ts` (npm) or the component's source and its types (repo). Name each prop as written. A component entry has `name`, `category`, `description`, `import` and `props`, and may have `parts`, `polymorphic`, `styling`, `state`, `examples`, `a11y` and `deprecated`; no other key. `props` is a list, `[{ "name": "variant", "type": "enum", "values": ["primary", "ghost"], "default": "primary" }]`, and a prop takes only `name`, `type`, `values`, `default`, `required`, `responsive`, `deprecated` and `description`.
- L9: Type mapping: a union of string literals is `enum` with `values`; `boolean` is `boolean`; `string` is `string`; `number` is `number`; `ReactNode` and `ReactNode | string` are `node`; a function is `callback`; `ReactElement` is `element`; `ElementType` or a component type is `component`; an object type is `object`; any other union is `union`.
- L10: A prop without `?` is `"required": true`. Set `default` only when the docs or the source say so.
- L11: Skip props inherited from HTML attributes. Keep `className`, `style`, `id` and `aria-*` only when they matter, and list the styling props in `styling` (`sx`, `className`, `style`, `classes`). Keep `children` when the component takes it. Keep what a control needs to work in a draft even when it comes from HTML: on a component that renders a button or a menu item, its `onClick` (or the system's own handler, such as `onSelect`), `disabled` and, on a button, `type` (`button`, `submit`, `reset`); on a component that renders a form field (an input, a textarea, a select), its `name`, `autoComplete`, `inputMode` and `required`, which the checks ask a draft to set.
- L12: `deprecated` is set only when the types or the docs say so.
- L13: A component that renders another element by a prop (`as`, `component`) gets `polymorphic: { "prop": "<name>" }`. A compound component lists its parts in `parts` (`Card` with `CardHeader`).
- L14: Controlled inputs get `state`, an array with one entry for each controlled value: `[{ "value": "value", "default": "defaultValue", "onChange": "onChange" }]`, with the names the component really has. `default` may be left out; `value` and `onChange` are required.

## Imports

- L15: npm kit: `import.from` is the package specifier and `import.name` the export (`@acme/ui`, name `Button`). A deep path (`@mui/material/Button`) with `"default": true` is fine when that is how the package exports it. Do not write relative paths.
- L16: repo kit: `import.from` is the project path of the module without extension (`"src/components/ui/button"`), from the project root, no `..`. Name the export exactly as the file does. Read the file to be sure.
- L17: Every name in `parts` and in an example's `imports` must be a component of the same kit.json.

## Examples and notes

- L18: One or two examples per component. An example is an object with `title`, `code` and `imports` (and `reference` only in a written kit), and no other key. `title` is a short English title (`"Primary button"`). It is valid TSX that compiles with the listed props only. `code` is one JSX expression. `imports` lists the kit components used. Give real text, no lorem ipsum.
- L19: Required props are always set in an example. Use enum values from `values`.
- L20: `a11y` holds the notes the docs or the source give (label rules, `aria-label` for icon buttons, keyboard use). Short sentences. Leave it empty when you read none.

## Tokens

- L21: `json/tokens.json` is DTCG 2025.10. Group names: `color`, `space`, `radius`, `font`, `fontSize`, `fontWeight`, `lineHeight`, `duration`. Put `$type` on the group. The types are `color`, `dimension`, `duration`, `fontFamily`, `fontWeight` and `number`; there is no shadow type yet, so leave shadows out and say so in the report.
- L22: A colour is `{ "colorSpace": "srgb", "components": [r, g, b] }` with channels from 0 to 1, optional `alpha`, optional `hex` (`#rrggbb`). A dimension is `{ "value": 8, "unit": "px" }` (`px` or `rem`). A font family is a string or an array of strings. A weight is an integer. An alias is `"{color.ink}"`.
- L23: Write only values you read in the theme or token files. Colours in `oklch`, `hsl` or `color-mix` are not sRGB: put a first guess, run `kit verify`, then copy the hex it reports in `actual` into `components` and `hex`.
- L24: Token names are short and stable (`color.primary`, `space.md`, `radius.lg`). Keep the design system's own words.
- L24a: Read tokens as widely as components. From the theme and palette files write: the brand colours with their shades; the neutral scale (a `grey` or `gray` scale, `neutral-*`); every ground the system has (page, surface or paper, a subtle or tinted ground); the text colours (primary, secondary, disabled); the border or divider colour; the state colours (hover, selected, focus, disabled) where the theme defines them.
- L24b: A system that spaces by a unit and a factor (MUI's `theme.spacing(n)`) gets the unit and its steps as tokens, named by the factor, with a letter first and `-` for the point (`space.x0-5`, `space.x1`, `space.x1-5`, `space.x2`): 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8 and 10 times the unit. A system with a named scale gets that scale. One spacing token is never enough to build a page.
- L24c: Before you report, check the kit against what a page needs: at least two grounds that differ, a border colour, a muted text colour, four or more spacing steps, and the font sizes of every text variant the components use. What the system truly lacks goes in the report in one line (not in `gaps`), so the person knows the pages will be flat and why.

## css-var-map.json

- L25: Use it when the system has CSS variables. Set `tokens.cssVars` in kit.json to `{ "prefix": "kit", "map": "json/css-var-map.json" }`.
- L26: The file maps a token path with dots to the native variable: `{ "color.primary": "--acme-color-accent", "space.sm": "--acme-space-2" }`. Every key must be a token in `tokens.json`. Every variable must exist in the system's CSS.
- L27: A token with no CSS variable stays out of the map. `kit verify` compares each mapped variable with its token in the browser.

## Providers and theme

- L28: A system that needs a root provider (`ThemeProvider`, `AcmeProvider`) gets it in `runtime.providers`: `{ "import": { "from": "<package>", "name": "<Name>" }, "props": {}, "bindings": {} }`.
- L29: `props` holds fixed string props. `bindings` holds props whose value is an export of a module: `{ "theme": { "from": "src/theme", "name": "theme" } }`.
- L30: Use the project's own theme when it has one: point `bindings` at the smallest module that exports it. A theme module that imports routers or stores is the wrong one: look for another, or use the library's default theme and say so in the report.
- L31: Style files the system needs globally go to `runtime.styles.imports` (`@acme/ui/styles.css`, or a project path such as `"src/ds/tokens.css"`). Never add a style file you did not see imported or documented.
- L31a: An unscoped package (no `@scope/`) that a provider, a binding or `runtime.styles.imports` comes from goes into `runtime.packages` with its installed version (`react-day-picker`). Otherwise kitvas reads the name as a project path.

## Themes

A design system's own themes are the kit's themes: official, with no mark. The shape of `tokens.themes` is in `reference/kit.schema.json`; the rules here say what to put in it.

- L31b: When the system has more than one theme (a light and a dark scheme, a Tailwind dark variant, the project's own variables behind a selector), write `tokens.themes` in `kit.json`: `default` is the id of the theme the base token file holds, `list` has one entry for each theme with an `id` and a `label`. The default theme has no `file`. Name a theme as the system does (`light`, `dark`). One scheme is not a list of themes: leave `themes` out.
- L31c: Every other theme gets its own token file, `json/tokens.<id>.json`, named in the entry's `file`. It holds only the tokens whose values differ from the default theme, at the same paths and with the same types (L21, L22). A path the base file lacks is a kit issue. Write only values you read in the system's own scheme (L23), for MUI the palette in `theme.colorSchemes.dark.palette`; never a value you made up or derived by inversion.
- L31d: When the system's own components take their colours from the system's theme and not from `--kit-*`, the theme entry needs `attributes`: what the system itself needs to switch its components. Names are `class` or `data-…`; kitvas puts them on `<body>` while that theme shows. They go on `<body>`, never on `<html>`, where the system's provider writes its own scheme attribute when it mounts. A system whose components follow `--kit-*` needs no `attributes`.
- L31e: A package such as MUI has its dark scheme only for a theme created with CSS variables and both schemes: `createTheme({ cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' }, colorSchemes: { light: true, dark: true } })`. With the package's default theme and no provider there is no dark to switch to. So: use the project's own theme module when it already has both schemes behind a selector (L30); otherwise write one small module, `<kit folder>/theme.ts`, with only that configuration call and no colour of its own, and name it in `runtime.providers`: `{ "import": { "from": "@mui/material/styles", "name": "ThemeProvider" }, "props": { "defaultMode": "light" }, "bindings": { "theme": { "from": ".kitvas/kits/<id>/theme.ts", "name": "theme" } } }`. `defaultMode` pins the root to the default theme, so the person's system preference never switches it. The theme entry then names the attribute that turns the scheme on: `"attributes": { "data-mui-color-scheme": "dark" }`.
- L31f: Look up how the scheme switches in the package's documentation (the Context7 tools) and in its installed source, never from memory. When no selector-based switch exists, do not write `theme.ts` and do not learn the theme; say so in the report (L38).
- L31g: Project variables behind a selector (`[data-theme="dark"] { --surface: … }`) are a theme: its `attributes` is that selector's attribute, its token file the values the selector sets for variables you mapped (L26).

## Tailwind

- L32: A project with Tailwind gets `runtime.styles.tailwind: { "entry": "<project path of that CSS file>" }`. Its version is the major of the project's own `tailwindcss` (3 or 4); kitvas builds with that one. For v4 the entry is the CSS file with `@import "tailwindcss"`; for v3 it is the CSS file with the `@tailwind` lines. The v3 config (an `@config` line, else `tailwind.config.{js,cjs,mjs,ts}`) is found by Tailwind, never named in the kit. Tailwind 2 or older is refused by `kit new`: show the message and stop.
- L33: In v4, theme variables (`--color-primary`, `--radius-md`, `--spacing`) are the variables to map in `css-var-map.json`. In v3 there are no theme variables: map each token onto a theme path written `theme(colors.primary)`, `theme(borderRadius.md)`, `theme(spacing.4)`, also when the config holds a literal colour. A path ends at a value: a nested colour (`primary: { DEFAULT: …, foreground: … }`) is `theme(colors.primary.DEFAULT)` and `theme(colors.primary.foreground)`, never `theme(colors.primary)`. Read the path in the project's config; never invent one.
- L34: With `@theme inline { --color-primary: var(--primary); }` the v4 theme variable is not written to the page. Map the token onto the variable it points at (`--primary`). A v3 config that says `primary: 'hsl(var(--primary))'` is still the path `theme(colors.primary)`.
- L35: In a Tailwind kit, `styling` is `className`, and examples use the component's own variants (`<Button variant="outline">`). Do not write utility classes in examples unless the component needs them.
- L35a: A Tailwind dark variant is a theme (L31b). In v4 its `attributes` is the class or the attribute the project's `@custom-variant dark` or `.dark` block uses (`{ "class": "dark" }`); in v3 it is what `darkMode` says: `'class'` gives `{ "class": "dark" }`, a selector such as `['class', '[data-mode="dark"]']` its attribute. Its token file holds the values that variant overrides. `darkMode: 'media'` follows the system, not a switch: no theme, say so in the report.

## How the project finds its files

kitvas builds and type-checks the project's own files that a kit uses (a repo kit's components, a theme module, a style file), so their imports and types must mean what they mean in the project. kitvas reads the project's `tsconfig.json` (or `jsconfig.json`) by itself: `baseUrl`, `paths`, the configs it extends or references, and the type files (`.d.ts`) its `include` and `files` take in. `resolve` in kit.json holds only what that file does not say. Its shape is in `reference/kit.schema.json`.

- L35b: When the kit uses files of the project, read the project's build configuration (`vite.config.*`, `webpack.config.*`, `rspack.config.*`, `next.config.*`, `craco.config.*`, a Babel module resolver) and compare it with `tsconfig.json`. Write what the build configuration says and the tsconfig does not. `resolve.roots`: folders an import without `./` starts from, in scripts and in Sass (`resolve.modules: ["src", "node_modules"]`, a Sass `loadPaths` or `includePaths`), as `"roots": ["src"]`; never `node_modules`. `resolve.alias`: names that stand for a folder or a file (`resolve.alias`), as `"alias": { "@": "src", "~styles": "src/styles" }`.
- L35c: `resolve.types` names the type files that give a library's or a component's types more values (`declare module '@mui/material/Button'`, `declare module '@mui/material/styles'`, `declare global`) when the tsconfig's `include` does not take them in. A `.ts` module that holds such a `declare module` goes there too when nothing the kit imports reaches it (a theme file). A folder stands for its `.d.ts` files: `"types": ["src/types/mui.d.ts", "typings"]`.
- L35d: Every path in `resolve` is a project path: from the project's root, forward slashes, no `./`, no `..`. Write only folders and files you saw on disk, and only names you read in the build configuration. Never repeat what `tsconfig.json` says. A kit whose components, provider, bindings and style imports all come from packages needs no `resolve`.

## Findings from `kit verify`

- L36: Fix each issue at its `path` in kit.json. `exportMissing`: the component is not exported under that name: reread the package's index or the file. `propRejected` and `exampleRejected`: the type or the example is wrong: reread the types. `tokenMismatch`: copy `actual` into the token (L23). `tokenUnread`: drop the key from the map and add the token to `gaps` as `unverified`.
- L36a: An `imports` issue that says `Could not resolve "<name>"` or `Can't find stylesheet to import`, for an import without `./` that is no installed package, means the project finds that file through its build configuration: find the folder or the name there and write it in `resolve` (L35b). A `propRejected` or `exampleRejected` for a value the project's own code uses (its own `variant`, `color`, `size` or breakpoint) means a type file of the project adds that value: find it and name it in `resolve.types` (L35c). Never drop such a value from the kit to make the check pass.
- L37: Do not hide a failure by deleting the component. Fix it, or move it to `gaps` and say so.

## Report

- L38: Reply in a few lines: the files written, how many components by category, the number of tokens by group, what went to `gaps`, the themes you learned and any theme you did not and why (L31f), and any rule here that was missing, wrong or hard to follow. Do not paste the JSON.
