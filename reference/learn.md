# Rules for learners

Read by the `learner` agent before it writes a kit. Each rule has an id; reports cite it. These rules are for kits learned from code (an npm package or a folder). A kit written from Figma, a website or screenshots follows `write-kit.md` instead; it reuses the token rules L21 to L24 and the prop type rules L9 to L11.

## Where you write

- L1: Write only inside the kit folder given in your prompt: `kit.json`, `json/tokens.json`, `json/css-var-map.json`. Never write `generated/`: kitvas writes it. Never edit the project's own files or the packages.
- L2: Keep the fields `kit new` wrote (`id`, `source`, `runtime.entry`, `runtime.packages`). Change them only when a rule below says so.
- L3: Never invent. Every component, prop, value, token and class name comes from a file you read (a `.d.ts`, a source file, a docs page, a token file). When you cannot read it, add it to `gaps`.
- L4: Never paste long text from docs. Write one plain sentence per description, in your own words.

## Core set

- L5: Cover about 25 to 30 components first, by category: `action` (Button, IconButton, Link), `input` (text field, select, checkbox, radio, switch, textarea), `layout` (Stack, Grid, Box, Container, Divider), `typography` (Heading, Text), `display` (Card, Badge, Avatar, Table, List), `feedback` (Alert, Spinner, Progress, Skeleton), `overlay` (Dialog, Menu, Tooltip, Popover), `navigation` (Tabs, Breadcrumbs, Pagination).
- L6: A request names components: do those, and only those. The rest of the core stays as it is.
- L7: A component that needs a framework (Next.js only, a server setup) goes to `gaps` with `unsupported`. One that exists but you did not cover goes to `gaps` with `missing`. One you could not check goes to `gaps` with `unverified`. A `gaps` path is the component name, or a prop path such as `Button.loading`. An entry has these two keys and no other: `{ "path": "Tabs", "reason": "missing" }`. A remark goes in your reply, never in kit.json.

## Props

- L8: Read props from the package's `.d.ts` (npm) or the component's source and its types (repo). Name each prop as written. A component entry has `name`, `category`, `description`, `import` and `props`, and may have `parts`, `polymorphic`, `styling`, `state`, `examples`, `a11y` and `deprecated`; no other key. `props` is a list, `[{ "name": "variant", "type": "enum", "values": ["primary", "ghost"], "default": "primary" }]`, and a prop takes only `name`, `type`, `values`, `default`, `required`, `responsive`, `deprecated` and `description`.
- L9: Type mapping: a union of string literals is `enum` with `values`; `boolean` is `boolean`; `string` is `string`; `number` is `number`; `ReactNode` and `ReactNode | string` are `node`; a function is `callback`; `ReactElement` is `element`; `ElementType` or a component type is `component`; an object type is `object`; any other union is `union`.
- L10: A prop without `?` is `"required": true`. Set `default` only when the docs or the source say so.
- L11: Skip props inherited from HTML attributes. Keep `className`, `style`, `id` and `aria-*` only when they matter, and list the styling props in `styling` (`sx`, `className`, `style`, `classes`). Keep `children` when the component takes it.
- L12: `deprecated` is set only when the types or the docs say so.
- L13: A component that renders another element by a prop (`as`, `component`) gets `polymorphic: { "prop": "<name>" }`. A compound component lists its parts in `parts` (`Card` with `CardHeader`).
- L14: Controlled inputs get a `state` entry: `{ "value": "value", "default": "defaultValue", "onChange": "onChange" }`, with the names the component really has.

## Imports

- L15: npm kit: `import.from` is the package specifier and `import.name` the export (`@acme/ui`, name `Button`). A deep path (`@mui/material/Button`) with `"default": true` is fine when that is how the package exports it. Do not write relative paths.
- L16: repo kit: `import.from` is the project path of the module without extension (`"src/components/ui/button"`), from the project root, no `..`. Name the export exactly as the file does. Read the file to be sure.
- L17: Every name in `parts` and in an example's `imports` must be a component of the same kit.json.

## Examples and notes

- L18: One or two examples per component, each valid TSX that compiles with the listed props only. `code` is one JSX expression. `imports` lists the kit components used. Give real text, no lorem ipsum.
- L19: Required props are always set in an example. Use enum values from `values`.
- L20: `a11y` holds the notes the docs or the source give (label rules, `aria-label` for icon buttons, keyboard use). Short sentences. Leave it empty when you read none.

## Tokens

- L21: `json/tokens.json` is DTCG 2025.10. Group names: `color`, `space`, `radius`, `font`, `fontSize`, `fontWeight`, `lineHeight`, `shadow`, `duration`. Put `$type` on the group.
- L22: A colour is `{ "colorSpace": "srgb", "components": [r, g, b] }` with channels from 0 to 1, optional `alpha`, optional `hex` (`#rrggbb`). A dimension is `{ "value": 8, "unit": "px" }` (`px` or `rem`). A font family is a string or an array of strings. A weight is an integer. An alias is `"{color.ink}"`.
- L23: Write only values you read in the theme or token files. Colours in `oklch`, `hsl` or `color-mix` are not sRGB: put a first guess, run `kit verify`, then copy the hex it reports in `actual` into `components` and `hex`.
- L24: Token names are short and stable (`color.primary`, `space.md`, `radius.lg`). Keep the design system's own words.

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

## Tailwind

- L32: A project with Tailwind v4 (`@import "tailwindcss"` in a CSS file) gets `runtime.styles.tailwind: { "entry": "<project path of that CSS file>" }`. Tailwind v3 (`tailwind.config.js`) is not supported yet: stop and tell the main agent.
- L33: Theme variables (`--color-primary`, `--radius-md`, `--spacing`) are the variables to map in `css-var-map.json`.
- L34: With `@theme inline { --color-primary: var(--primary); }` the theme variable is not written to the page. Map the token onto the variable it points at (`--primary`).
- L35: In a Tailwind kit, `styling` is `className`, and examples use the component's own variants (`<Button variant="outline">`). Do not write utility classes in examples unless the component needs them.

## Findings from `kit verify`

- L36: Fix each issue at its `path` in kit.json. `exportMissing`: the component is not exported under that name: reread the package's index or the file. `propRejected` and `exampleRejected`: the type or the example is wrong: reread the types. `tokenMismatch`: copy `actual` into the token (L23). `tokenUnread`: drop the key from the map and add the token to `gaps` as `unverified`.
- L37: Do not hide a failure by deleting the component. Fix it, or move it to `gaps` and say so.

## Report

- L38: Reply in a few lines: the files written, how many components by category, what went to `gaps`, and any rule here that was missing, wrong or hard to follow. Do not paste the JSON.
