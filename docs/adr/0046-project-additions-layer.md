# 0046. Project additions layer

Date: 2026-11-23. Status: accepted. Adds to the kit contract (`src/kit/domain/contract.ts`) and to the layered kit store of stage 2. Spec: `docs/specs/2026-11-23-kitvas-stage-3b-rework-craft-design.md`, section 6.4.

## Context

A crafted icon, logo or component must become usable by the next `compose` and `rework`. The kit it joins may be built in (Base), a project kit written by kitvas, or an npm package. Writing into a package is wrong, writing into the person's application source is forbidden, and a Base edit would change the plugin.

## Decision

- **A layer of kitvas's own.** Additions live in `.kitvas/additions/<kit-id>/`: `additions.json` (`{ schemaVersion: 1, components: KitComponent[] }`, each a catalog entry in the kit contract's component shape, with `category: 'icon'` for an icon) and the files in `components/`. It works for every kit source.
- **Merged by the loader.** `loadKit` adds the additions' components after the kit's own, and `LoadedKit.additions` names them. `LoadedKit.entry` is the file `@kit` resolves to: for a built-in or npm kit with additions, an entry under `.kitvas/additions/<id>/generated/` that re-exports the kit's own entry and then the additions, so the package and the plugin are never touched. The generated `@kit` entry exports them from their folder, and the catalog and `kit css` include them, so `compose`, `rework` and the checks see them as kit components.
- **Ports.** `KitStore.readAdditions(id)`, `KitWriter.writeAddition(id, component, files, replace)` and `KitWriter.exportFiles(dir, files)`. Only adapters touch the disk.
- **Names.** A name already in the kit, or already an addition, is `ADDITION_EXISTS` unless `--replace` is given. A component that fails the contract is `ADDITION_INVALID`.
- **Verified like the rest.** `kit verify` also checks the additions: schema, imports, types and render.
- **Export.** `craft export` writes the same files and a short README to a folder the person names. kitvas never writes into the application's own source.

## Consequences

Base and npm kits gain components without being edited, and an addition survives a kit refresh. The loader and the generated entry now have two inputs, so the kit hash must cover the additions. An addition is kitvas's data in the person's `.kitvas` folder: removing it is deleting its folder entry.
