# 0080. The client imports values from package-free files of `src/`

Date: 2026-11-26. Status: accepted. Changes ADR 0055 in part ("the page and the frames still share only `client/channel/`"). Plan 23.

## Context

The studio page and the frames are bundled for the browser from `client/`. Until now a client file took only types from `src/`, so the browser bundles never carried server code (zod, Node built-ins). Every value the page or a frame needed from the server was copied into `client/` instead: the style property list, the kinds and keyword lists, the utility tables, the inverse of an op, the match scores, the request limits, the canvas widths, the theme's tones, the logo's pointer and its period. Fourteen files held such copies, and a test held each copy equal to its original. A change to an original meant two edits, and a copy whose test compared samples only (the inverse of an op, the kit words of a keyword) could drift unseen.

## Decision

- **A client file may import values from a `src/` file whose whole graph of value imports is package-free**: no package, no `node:` built-in, and no module's `index.ts` (an index brings its whole module, schemas and packages with it). A type-only import is erased and may name any file, as before.
- **The pure part of an original moves beside it, and the old file re-exports what others took from it**, so no import in `src/` changes. `src/edit/domain/op-limits.ts` (the patterns and limits) and `op-kinds.ts` (which kind an op is, the ids it names, its inverse, `styleText`) come out of `ops.ts`, which loads zod; `src/studio/views/widths.ts` comes out of `draft-query.ts`, which imports the drafts module; `src/studio/api/requests/request-limits.ts` comes out of `request-schemas.ts`; the logo's pointer, `src/studio/pages/brand/pointer.ts`, comes out of `logo.ts`, so the frame carries two strings and not the whole logo.
- **The client imports an original by its own file**, never through `src/<module>/index.ts`.
- **A guard holds the rule.** `test/guards/client-imports.test.ts` walks the value imports of every import from `client/` (but `client/figma/`) into `src/`, and names the client file, the path and the first impure file on it.

## Turned down

- **Copies held equal by tests.** That was the rule until now: two places to change, a test whose only job is to compare them, and a drift wherever the test compares samples only.
- **A top-level shared folder that both `src/` and `client/` import.** It takes each value away from the module that owns it (the op limits beside the op schemas, the widths beside the address rules) and needs a rule of its own; the pure files stay in their modules, and the guard keeps the bundles clean.
- **Importing through the module's `index.ts`.** The index brings zod and the Node built-ins of the module into the browser.

## Consequences

- The frame bundle may carry `src/` code: the property list (`src/edit/domain/types.ts`), the studio's tones (`src/studio/theme/tokens.ts`), the logo's pointer and period (`src/studio/pages/brand/pointer.ts`, `src/studio/pages/skin/logo.ts`) and the helpers of `src/shared/values/`. `runtimeFiles` in `src/main.ts` lists these files too, so a change to one rebuilds the drafts; `test/client/frame/runtime-files.test.ts` fails on a `src/` file the frame reaches and the list misses.
- A `src/` file the client imports stays package-free. A zod import added to `op-limits.ts`, say, fails the guard, which names the client file that would carry it.
- `client/channel/` stays the only protocol between the page and the frames; only where a shared value comes from changes.
- `client/figma/` keeps its own rule: it imports only its own folder and no package.
- The tests that only held a copy equal to its original are gone; every behavioural test stays as it was.
