# 0083. Themes are token sets of the kit; the project adds tokens and theme values

Date: 2026-11-26. Status: accepted. Changes ADR 0046 in part (what the additions layer holds). Plan 25.

## Context

A person asks for a screen "in light and dark". A kit may have one theme, or none that the person wants. The design system's own components may take their colours from the system's own theme (MUI, a repo with a provider), so a second set of token values alone does not make them dark. The additions layer of ADR 0046 holds only components, so a project cannot add a token or a theme value without editing the kit, which for a package or Base is forbidden.

## Decision

- **A theme is a set of token values of the kit.** `tokens.themes` in `kit.json` lists the themes and the default. The default theme is the base token file. Another theme has its own file with only the tokens whose values differ, at the same paths and types; a path the base lacks is a kit issue. The contract's reserved `tokens.modes` is removed.
- **A theme is the option `theme`.** A version offers themes through the option `theme` in `options.json` (ADR 0082); its values are theme ids of the kit. The token sheet writes each theme's values under `data-opt-theme` on the page's root. No second attribute and no second kind of option.
- **A system's own switch is `attributes` on the body.** A theme may name `attributes` (`class` or `data-…`) that the design system itself needs to switch its own components. The frame puts them on `<body>` while the theme shows, never on `<html>`, where a system's provider writes its own scheme attribute. A system whose components take every colour from `--kit-*` needs none. A system's own themes are learned as the kit's themes and are official.
- **Tokens and theme values of the project live in the additions folder.** `.kitvas/additions/<kit>/tokens.json` holds new tokens; `tokens.<theme>.json` holds a theme's values (a whole theme the kit lacks, or single values of one it has). `loadKit` merges them after the kit's own and names them. A kit's own value is never overridden by an addition of the same path and theme: that is an issue. The skill writes the file and `kit show` checks it; no new command.
- **They carry a mark.** A small "+" with "Added by this project. Not part of {source}." on what an addition brought: a theme value in the Options row, an added token in Properties and on the kit's page. Hand-off's code brief lists added tokens as things to create. A draft that uses an added token is on-kit for the checks.
- **The skills ask before they add.** When a screen needs what the kit lacks, compose, rework and craft ask once, with three answers for each gap (add it, use the nearest, leave it out). Nothing is added without a yes.

## Turned down

- **Writing into the kit's own token file, with a flag.** A package's or Base's files are not the project's to edit, and a refresh would drop the values. The additions layer already exists for this.
- **A second attribute and a `kind` field for themes.** A theme is one more option, so the editor, the check and the style edits need nothing new.
- **Provider props per theme.** The probe on MUI 9.6.0 showed a selector attribute is enough to switch the scheme, set once on `<body>`; props per theme would add a second mechanism.
- **The theme's attributes on the root.** A provider writes its own scheme attribute on `<html>` when it mounts and overrides ours; the body is not touched by it.
