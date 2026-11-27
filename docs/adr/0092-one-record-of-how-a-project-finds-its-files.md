# 0092. One record of how a project finds its files and types

Date: 2026-11-27. Status: accepted. Changes in part `0032-packages-and-react-from-project.md` and `0033-component-styles-in-the-bundle.md`.

## Context

kitvas builds and type-checks files of the person's project: a repo kit's components, a theme module a provider binds, a style file. Three tools read them, and each knew a different part of the project's configuration. esbuild extended the project's `tsconfig.json`, so `baseUrl` and `paths` held for scripts. Sass looked beside the file and in `node_modules` only. tsc got the `paths` and nothing else: no `baseUrl`, and no type file that the project's own check reads without an import.

So a project that imports from a base folder (`@use 'style/space'`, `import { x } from 'shared/x'`) failed `kit verify` at `imports`, in Sass. A project that gives a library's component values of its own in a type file (a `variant` the library does not have) failed at `types`, with every such value refused. What only a bundler's configuration says (webpack `resolve.modules` and `resolve.alias`, a Sass `loadPaths`, a Vite alias) was read by nothing.

## Decision

- How a project finds its files and types is one record, `ProjectResolve` (`src/shared/project/`): import patterns in the form of tsconfig `paths`, where the pattern `*` holds the folders an import without `./` starts from, and the type files a types check reads besides its entry. A build or a check reads it once and hands it to all three tools.
- kitvas reads the record from the project's `tsconfig.json`, or `jsconfig.json` when there is none: `paths`, `baseUrl` as a folder imports start from, the relative configs it extends (three hops) and the configs it `references`, and the `.d.ts` files its `include` and `files` take in, without its `exclude` and the folders its build writes. Only type files are taken; the project's scripts come in by imports, as before.
- What only the project's build configuration says is declared in `resolve` of kit.json: `roots`, `alias` and `types`, all project paths. The learner reads the build configuration and writes it (rules L35b to L36a in `reference/learn.md`). A declared pattern comes before the tsconfig's.
- esbuild gets the patterns in the tsconfig kitvas writes for it, which still extends the project's. Sass gets the same patterns as importers, tried before `node_modules`. tsc gets them as `paths`, and the type files as `files` and `include`. `kit exports` follows the record too, with its tsconfig in a temp folder, so nothing is written into the project.

## Turned down

- **Running the project's bundler configuration.** `vite.config.ts` or `webpack.config.js` is the project's code. Running it in Node breaks the rule that no code of the project runs outside the browser (ADR 0032), and each bundler would need a reader of its own.
- **Guessing common folders** (`src`, `app`, `@` for `src`). A wrong guess resolves an import to another file than the project does, without an error.
- **Every file of the project's `include` in the types check.** The project's own check is the place for the project's code. kitvas would read files no kit uses, under settings that are not the project's, and a check would take as long as the project's.
- **A setting for each tool** (a Sass load path here, a list of type files there). That is the fault this record removes: three tools that disagree about one project.

## Consequences

A project whose tsconfig describes its imports needs nothing declared. A project made by Vite, which keeps `include` and `paths` in a referenced config, is read too. A folder of the project named like a package is found before the package, as in the project's own build. A type file of the project that does not parse hides the other findings of the types check, as a broken file reached by an import always did.

Not read: `types` and `typeRoots` of the tsconfig; the config of a package in a monorepo that the root config does not reference (its patterns are declared in `resolve`); what a Sass loader adds to every file (`additionalData`); the `~` in front of a Sass load that older loaders take out; loaders that turn a file into a component.
