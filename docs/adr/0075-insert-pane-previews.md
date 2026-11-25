# 0075. Previews in the Insert pane are screenshots made once per kit change

Date: 2026-11-25. Status: accepted.

## Context

The editor's Insert pane listed a kit's components and icons by name. The owner approved a redesign like Figma's Assets panel: each component tile shows the component as the kit really draws it, and each icon is a glyph. The pane holds every component of the kit at once, often dozens, and up to a thousand icons.

## Decision

- **Previews are screenshots, made once per kit change and served as images.** `kitvas kit previews <id>` builds the kit's catalog (cached when current), shoots each component's first example the catalog stamp lists as shown, and writes `previews/<set>/` in the kit's catalog folder beside `build/`, then the stamp `previews/previews.json` last. A shot is the example's first element with the reach of its shadow (the rule of `kit verify`'s `look`), at 240×480 and device scale 2 (a narrow page, so a component as wide as its page still reads in a tile of about 90 px), on the page's own background; the stamp keeps that background as the tile's backdrop.
- **The icons are one sheet.** The catalog bundle renders all icon names, the safe ones (`/^[A-Za-z0-9_-]+$/`) and at most the first 1024, as one more example under the key `kitvas-icons`: a grid of 32 px cells, up to 32 a row, each icon centred with its default props and cut at the cell. The grid is shot exactly, so cell i is at `x = (i % columns) * cell`, `y = floor(i / columns) * cell`. A synthetic entry of the catalog bundle was chosen over a second page because it shares the bundle's providers, styles and project-kit handling as they are.
- **Fresh by the catalog's key.** The stamp holds the key of the catalog build it was shot from and a format number. The palette route reads the stamp and the key a build would have now (`currentCatalogKey`, a hash with no build); equal means `ready`. An unchanged kit costs a hash and no browser.
- **The palette route starts the work.** When previews are missing or stale it starts one `previews` job per kit (its own job target, like a kit's catalog) and answers `making` with the previous set, if any; the pane asks again every 2 s. A job without a browser makes the studio answer `none` for the rest of its run; any other failure is logged and answers `none` until the kit's key changes.
- **Served by the prototype origin**, under `/k/<key>/<kit>/previews/…`, PNG files only, through `frame/frame-files.ts` with the same path guards as the catalog. A new set lives in a new folder, so its addresses change with it.

## Turned down

- **Live scaled frames per tile.** Each tile would be its own sandboxed frame with the kit's React app, scaled down: dozens of apps in one pane, slow to open and heavy to keep, and a thousand icons would be a thousand renders.
- **A description-only list.** Names and descriptions are what the pane had; they do not show what a component looks like, which is the point of the redesign.

## Consequences

The first open of the pane for a kit waits for one job (a catalog build when needed, then the shots); after that the previews come from disk until the kit changes. A kit whose catalog does not build, or a machine with no browser, keeps the name-only tiles. The catalog bundle grows by the sheet's names and one function; `CATALOG_FORMAT` is 5.
