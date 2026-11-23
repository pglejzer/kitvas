# 0029. Rendered examples on the kit page

Date: 2026-11-23. Status: accepted. Adds to `0006-kit-contract.md` and `0024-studio-events-and-jobs.md`.

## Context

The kit page listed each component's examples as code only. A person judging a kit, and an agent choosing components, need to see what the examples look like. An example is code from `kit.json`: untrusted text that a kit author wrote, so it must not run on the studio's origin. A build takes seconds, so the page cannot wait for it, and the studio must not depend on a build that has not run.

## Decision

- **Build.** `kitvas kit build [id]` bundles every example of a kit into one page under `.kitvas/cache/catalog/<kit id>/build/` and writes a stamp, `build/json/catalog.json`, last. The stamp lists the example keys that are in the bundle (`shown`) and the ones whose code does not parse (`skipped`); a key is `<Component>.<n>`, n counted from 1 in `kit.json` order. An unchanged kit is not built again (`cached`).
- **Where it runs.** The studio never builds in its own process. The kit page script posts `POST /api/v1/kits/{id}/catalog`, which starts a `catalog` job. A catalog job runs `kitvas kit build <id> --json` through the same runner, limits and events as a draft's build (0024). `JobSchema.slug` holds the kit id for this kind. The one-job-per-target rule counts drafts and kits apart, so a draft named `base` and the kit `base` do not block each other. An unknown kit is `KIT_NOT_FOUND`, a running catalog job of that kit is `JOB_RUNNING`.
- **Where it is shown.** The prototype origin serves the files below `build/` at `/k/<key>/<kit id>/<folder>/<file>`, through the same map of files, content types, headers and refusals as a draft (`frame/frame-files.ts`). The kit id must match the id pattern of `kit.json`; a wrong key answers like a missing file. Each example is its own iframe, `.../html/index.html?example=<key>`, with `sandbox="allow-scripts"` and a fresh channel, so example code has an opaque origin and no token, exactly like a prototype.
- **What the page does with it.** The server writes the frames and the notes from the stamp: a frame for each shown key, a "no preview" note for each skipped one. A frame reports its height and whether it rendered with the `example` message over the checked channel (`client/channel/protocol.ts`); the page script sizes the frame, or hides it and shows the note. If there is no stamp, the script starts the catalog job and reloads the page once when a new build ended.

## Consequences

The studio's process only reads a small file (the stamp) and serves files; a broken or slow example costs a job, not the studio. The kit page works without a build: it shows the code and a note that the examples are being built. Only one more path shape and one more job kind enter the studio, and both reuse the checks of the draft path, so `docs/security.md` gains rows, not a new model. A kit's example can still run code in a frame: it is as untrusted as a prototype and is held by the same sandbox. The catalog is a cache: deleting `.kitvas/cache/` only means the next visit to the kit page builds it again.
