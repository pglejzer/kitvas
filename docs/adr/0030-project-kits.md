# 0030. Project kits and the `npm` and `repo` sources

Date: 2026-11-23. Status: accepted, changed in part by ADR 0076. Adds to `0006-kit-contract.md` and `0029-kit-catalog.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2a-project-kits-design.md`, sections 2, 3, 9 and 10.

## Context

Stage 1 had one kit, Base, shipped in the plugin. A person wants prototypes in the design system their project already uses: a public package such as MUI, a private one such as `@company/ui`, or the project's own components in a folder such as `src/components/ui`. The kit must live with the project, not with the plugin, and a kit's text (`import.from`, paths, specifiers) now names things on the person's disk, so it needs checks the built-in kit never needed.

## Decision

- **Where.** A project kit is `<project>/.kitvas/kits/<id>/`, the shape of `kits/base/` plus a `generated/` folder. The kit store has two layers, built-in then project. A project folder with a built-in id is shadowed: the built-in kit wins and `kit check` reports `kitIssue.idTaken`. `kit new` refuses such an id up front (`KIT_EXISTS`). `kit list`, `kit show` and the studio's kit pages see both layers. `kitvas kit use <id>` sets the project's kit in `.kitvas/config.json`.
- **Sources.** `source` has three members: `builtin`, `{ type: 'npm', package, version }` (a package in the project's `node_modules`, with the version installed when it was learned) and `{ type: 'repo', path }` (a project-relative folder).
- **Imports.** An npm kit's `import.from` is a package specifier; a repo kit's is a project-relative module path with no `..`. Provider modules and `runtime.styles.imports` may also name project paths. `runtime.entry` of a project kit is `generated/kit.ts`, written by kitvas from the component list (`syncGeneratedEntry`), never by an agent.
- **Checks.** `loadKit` stays pure (the source rules in `kit/domain/sources.ts`). The checks that need the disk (a path exists and its real path is inside the project, a package is installed, React is 18 or later) are `projectIssues`, run by `kit check` and `kit verify`.
- **Errors.** `KIT_PACKAGE_MISSING`, `KIT_EXISTS` and `KIT_SOURCE_INVALID`.
- **Never installed.** kitvas never installs a package. A missing package is reported with the install command for the person.

## Consequences

A team may commit `.kitvas/kits/` and share the kit. Kit text is untrusted input that points at the disk, so every path is contained in the project by `realpath` and every specifier matches a strict package pattern; `docs/security.md` has the rows. The studio's kit page shows the source of each kit and the state of its last verification (ADR 0031). Tailwind v3, which has to run a config file in Node, is left to a later stage (`KIT_SOURCE_INVALID`).
