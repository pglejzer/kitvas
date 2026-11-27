# Your design system

A kit describes one design system: components, tokens and icons. The rework and craft skills look for yours first (`kitvas kit detect`) and offer to learn it before they fall back to the built-in kitvas UI kit. For the rest of kitvas, see the [README](../README.md).

kitvas can learn from:

- an npm package (public or private) or a folder of your own components, with Tailwind v4 supported;
- the code of your components, in any technology (`kitvas kit new <id> --from code:<folder>`);
- a Figma file, read through your own Figma MCP;
- a website, or screenshots.

To set one up:

1. If it is a package, install it in your project yourself. kitvas never installs a design system.
2. Run `/kitvas:learn`. The kit lives in `.kitvas/kits/<id>/`; commit it to share it with your team.
3. `kitvas kit verify <id>` checks the kit against your real packages: imports, types, every example rendered in the browser, and the tokens. `/kitvas:learn` fixes what it reports.
4. `kitvas kit use <id>` makes it the project's kit.

What craft adds goes to `.kitvas/additions/<kit-id>/`, next to the kit, never into the kit's package.

## A kit from code in any technology

Drafts are written in React. When your components are written in anything else, `/kitvas:learn` reads their code as text and writes each one again in React, with your own names and values. Nothing of your project is built or run.

```bash
kitvas kit new acme --from code:src/components
```

- Each component in the kit says which of your files it came from (`project`). A hand-off writes the result back in your project's technology and points at your own component.
- For every example the agent also writes the component's own markup as your code draws it, in `originals/`. kitvas compiles your real style files, draws that original in its own browser beside the copy and compares the two in numbers: sizes within half a pixel, every other value exactly, the hover, focus and pressed looks too. Then it compares them as pictures. `kitvas kit verify <id>` reports each value that differs, and the agent fixes it, in at most three rounds.
- A copy may not match the original in every detail. To have each copy checked against the real thing, give the address of your running app (a local one counts), screenshots or a Figma file. You may give them later: `/kitvas:learn` compares and fixes the kit you have, without a new conversion (`kitvas kit scan`, `kitvas kit images`, `kitvas kit crop`).

Every component is labelled with how it was checked:

| Label | Compared with |
| --- | --- |
| Compared with the app | your running app, screenshots or Figma, as pictures |
| Compared with the code | the original that kitvas drew from your markup and style files, in numbers |
| Read only | nothing: the reason is given, such as a style language kitvas cannot compile |

A component carries its strongest label; under its examples the kit page shows each comparison that was made, with its numbers. kitvas never calls a component exact that it did not compare.

The kit records the files of each component. When they change, `kitvas kit detect` and `kitvas kit show` name the component as out of date, and `/kitvas:learn` converts only those again. `kitvas kit verify <id> --current <Name>` marks a component that was looked at against the project as it is now and needed no change.

## Themes

A kit may have themes, such as light and dark (ADR 0083). `tokens.themes` in `kit.json` lists them:

```json
"themes": {
  "default": "light",
  "list": [
    { "id": "light", "label": "Light" },
    { "id": "dark", "label": "Dark", "file": "json/tokens.dark.json", "attributes": { "data-mui-color-scheme": "dark" } }
  ]
}
```

- The default theme is the kit's own token file, so it has no `file` and no `attributes`.
- Another theme's file holds only the tokens whose values differ, at the same paths and with the same types as the base. A path or a type the base lacks is a problem of the kit. A token takes `$type` from its group in the base, and a base token that points at a changed one follows it.
- `attributes` are what the design system's own components need to switch, `class` or a `data-…` name. The page puts them on `<body>` while the theme shows. A system whose components take every colour from the kit's tokens needs none.
- A version offers themes with the option `theme` in its `options.json`; its values are the kit's theme ids.

Your project can add what the kit lacks without changing the kit, in `.kitvas/additions/<kit-id>/`:

- `tokens.json` holds new tokens, in the same shape as the kit's token file. A path the kit already has is refused.
- `tokens.<theme>.json` holds the values of one theme. A theme id the kit lacks is a new theme, labelled with its id. A value the kit's own theme file sets is refused, and so is a file for the default theme.

Added tokens and themes are marked "Added by this project" in the studio. A file with a problem is left out, and `kitvas kit check <id>` names it; the rest of the kit still works.
