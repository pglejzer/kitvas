# src/kit

Reads kits and checks them against the kit contract.

- The contract is the zod schema in `domain/contract.ts`. Change the schema, never a hand-written type. Agents read it as `reference/kit.schema.json`: after a change, run `npm run kit-schema` (a guard fails on a stale file); a part a rule points at is an exported schema named under `$defs` in `scripts/kit-schema.ts`.
- A problem inside a kit is a `KitIssue` with a message key (`kitIssue.<name>` in `locales/en.json`), not thrown text. Only a kit.json that fails the schema, or is not JSON, throws `KIT_INVALID`.
- `loadKit` returns the kit with its issues; `requireKit` refuses a kit that has any. Code that builds from a kit uses `requireKit`.
- Tokens are DTCG 2025.10. `domain/tokens.ts` reads six types; a new type needs a shape there and a case in `domain/css-vars.ts`.
- Prototype styles use `--kit-*` names only; `cssVarName` is the one place that builds them. `tokenSheet` (`domain/css-vars.ts`) is the one writer of the token sheet, for every build and `kit css`: the base under `:root`, a token mapped in `tokens.cssVars.map` as `var(<native>)` under `:root, body`, then each theme under `optionSelector('theme', id)`.

## Themes and added tokens (ADR 0083)

- `domain/themes.ts` (`layTokens`) is the one place that reads theme files and the additions' token files. The default theme is the base file and has no `file` or `attributes`; another theme's file sets only paths and types the base has. Every file is laid on the base token by token, so `$type` and aliases of the base hold.
- The additions folder may hold `tokens.json` (new tokens; a path or group the kit has is refused) and `tokens.<theme>.json` (one theme's values; an id the kit lacks is a new theme labelled from its id, a value the kit's own theme file sets is refused, the default theme is refused). A kit without `tokens.themes` gets the default theme `default` once the project adds one.
- `LoadedKit.tokens` holds the added tokens too; `addedTokens` names them, `themes.list[].added` marks a theme the additions brought or gave values to, and `themeTokens` holds per theme only the tokens whose values differ.
- A refusal is a `KitIssue` whose `path` is the file; a broken file of the additions never throws. Theme files and the additions' token files are part of the kit's hash, pushed only when there are some, so other kits keep theirs.
- Tests use the fixture kit in `test/fixtures/kits/tiny/`; project kits in tests come from `test/kit/helpers/project-kit.ts`.

## Project kits

- Kits live in two layers (`adapters/layered-store.ts`): built-in, then `<project>/.kitvas/kits/`. A project folder with a built-in id is hidden; `shadowedIds` names it. `LoadedKit.project` is set only for project kits.
- `npm` and `repo` sources: every rule about where an import points is in `domain/sources.ts` (`componentKind`, `moduleKind`, `importTargets`). Use them; never test `PACKAGE_SPECIFIER` or `PROJECT_PATH` by hand. A provider, binding or style import is a package when scoped or declared in `runtime.packages`, else a project path.
- `resolve` of kit.json (ADR 0092) declares what the project's build configuration says about imports and type files and its tsconfig.json does not. The kit module only holds it; builds and checks pass it on beside `LoadedKit.project`.
- `loadKit` stays pure: the source rules are issues of the kit. Checks against the project on disk (paths, packages, React 18+) are `projectIssues`, through the `ProjectFiles` port.
- `generated/kit.ts` (`GENERATED_ENTRY`) is written only by kitvas: `generatedEntry` builds it, `syncGeneratedEntry` writes it through the `KitWriter` port. Every string from kit.json is quoted with `JSON.stringify`; bare names must match a strict pattern.
- Written kits (`figma`, `web`, `images`, `code`; `isWrittenKit`): components are files of `<kit>/components/`, and `import.from` is a `KIT_PATH`, never a package or a project path. The kit's hash also covers those files, so an edit makes `verify.json` stale; other kits keep their hash.
- The `code` source (`kit new --from code:<folder>`): a kit whose React components an agent wrote from the project's code in any technology. A component may carry `project` (`files` or `package`, never both: `kitIssue.originOneOf`; the selector or tag in `name`; its `styles`; `scoped`) and an example `original` (`ORIGINAL_PATH`, `originals/<Name>.<n>.html`); both are refused in any other kit (`kitIssue.onlyCodeKit`). Its hash also covers `originals/`. A style import (`runtime.styles.imports`) may be a project path in a `code` kit; no other import of a written kit may. `kit new` checks only that the folder exists inside the project. An example's `reference` must exist (`REFERENCE_PATH`). `domain/crop-boxes.ts` is the shape of `boxes.json`. kitvas parses no Figma data and copies no fonts, images or logos into a kit.
- `kit new` (`app/new-kit.ts`) writes a skeleton and never validates it; the learner fills it, `kit verify` checks it.
- Learners working at once write fragments to `<kit>/parts/` (`domain/fragments.ts`, ADR 0081); `kit merge` checks all of them before it writes kit.json, then removes the folder. `parts/` is no part of the kit: `loadKit` and the kit's hash never read it.

## Additions

- `.kitvas/additions/<kit-id>/` (ADR 0046) holds components crafted by kitvas, for any kit source. `loadKit` merges them after the kit's own and `LoadedKit.additions` names them; never write into a package or the person's source.
- `LoadedKit.entry` is the file `@kit` points at: a project kit's `generated/kit.ts` (with a line per addition), or, for a built-in kit with additions, `.kitvas/additions/<id>/generated/kit.ts`, which re-exports the kit's entry and the additions. Use it, never `join(kit.dir, runtime.entry)`.
- A crafted icon has category `icon`; a logo `display`; a component the category `craft add --category` names (default `display`).
