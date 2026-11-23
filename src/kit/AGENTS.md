# src/kit

Reads kits and checks them against the kit contract.

- The contract is the zod schema in `domain/contract.ts`. Change the schema, never a hand-written type.
- A problem inside a kit is a `KitIssue` with a message key (`kitIssue.<name>` in `locales/en.json`), not thrown text. Only a kit.json that fails the schema, or is not JSON, throws `KIT_INVALID`.
- `loadKit` returns the kit with its issues; `requireKit` refuses a kit that has any. Code that builds from a kit uses `requireKit`.
- Tokens are DTCG 2025.10. `domain/tokens.ts` reads six types; a new type needs a shape there and a case in `domain/css-vars.ts`.
- Prototype styles use `--kit-*` names only; `cssVarName` is the one place that builds them. A token mapped in `tokens.cssVars.map` is written as `var(<native>)` by `tokensToCss`.
- Tests use the fixture kit in `test/fixtures/kits/tiny/`; project kits in tests come from `test/kit/helpers/project-kit.ts`.

## Project kits

- Kits live in two layers (`adapters/layered-store.ts`): built-in, then `<project>/.kitvas/kits/`. A project folder with a built-in id is hidden; `shadowedIds` names it. `LoadedKit.project` is set only for project kits.
- `npm` and `repo` sources: every rule about where an import points is in `domain/sources.ts` (`componentKind`, `moduleKind`, `importTargets`). Use them; never test `PACKAGE_SPECIFIER` or `PROJECT_PATH` by hand. A provider, binding or style import is a package when scoped or declared in `runtime.packages`, else a project path.
- `loadKit` stays pure: the source rules are issues of the kit. Checks against the project on disk (paths, packages, React 18+) are `projectIssues`, through the `ProjectFiles` port.
- `generated/kit.ts` (`GENERATED_ENTRY`) is written only by kitvas: `generatedEntry` builds it, `syncGeneratedEntry` writes it through the `KitWriter` port. Every string from kit.json is quoted with `JSON.stringify`; bare names must match a strict pattern.
- Written kits (`figma`, `web`, `images`; `isWrittenKit`): components are files of `<kit>/components/`, and `import.from` is a `KIT_PATH`, never a package or a project path. The kit's hash also covers those files, so an edit makes `verify.json` stale; other kits keep their hash. An example's `reference` must exist (`REFERENCE_PATH`). `domain/crop-boxes.ts` is the shape of `boxes.json`. kitvas parses no Figma data and copies no fonts, images or logos into a kit.
- `kit new` (`app/new-kit.ts`) writes a skeleton and never validates it; the learner fills it, `kit verify` checks it.

## Additions

- `.kitvas/additions/<kit-id>/` (ADR 0046) holds components crafted by kitvas, for any kit source. `loadKit` merges them after the kit's own and `LoadedKit.additions` names them; never write into a package or the person's source.
- `LoadedKit.entry` is the file `@kit` points at: a project kit's `generated/kit.ts` (with a line per addition), or, for a built-in kit with additions, `.kitvas/additions/<id>/generated/kit.ts`, which re-exports the kit's entry and the additions. Use it, never `join(kit.dir, runtime.entry)`.
- A crafted icon has category `icon`; a logo `display`; a component the category `craft add --category` names (default `display`).
