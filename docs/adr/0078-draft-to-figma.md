# 0078. A draft goes to Figma as scripts kitvas writes and the skill sends through the person's own Figma MCP

Date: 2026-11-25. Status: accepted. Changes ADR 0076 in part (a sixth section, `## Handoff`, in the decisions file). Builds on stage 1's decision 7 (one measurement service) and ADR 0008 (one id per element). Spec: `docs/specs/2026-11-25-kitvas-stage-5-handoff-design.md`, Part A, calls 1 to 3. Plan 21.

## Context

A draft ended inside `.kitvas/`: a designer could not open it in Figma. The owner made sending a draft to Figma a basic feature, through the person's own Figma MCP, with no Figma key in kitvas (D1). Figma's MCP gives `use_figma` (a Plugin API script run in the file), `upload_assets` and a page capture. One probe ran in a new file in the owner's Drafts on a "View" seat: variables with scopes and code syntax, auto layout, bound fills and gaps, text after a font load, SVG and `FILL` children all worked. The other probes were not run; the first live send is their test.

## Decision

- **kitvas measures and writes; the skill sends.** `kitvas handoff figma <slug>` builds the draft, walks its layers in the browser at 1280 and 390 (`measureLayers`, a new call `layers` on the checks module's browser), shapes a tree named by section ids and kit components, binds a value to a kit variable only when exactly one token of the property's own kind has it, and writes a package under the version: `tree.json`, `variables.json`, `manifest.json`, `assets/` and numbered scripts.
- **A script is data plus one bundled builder.** The builder is typed TypeScript in `client/figma/` against a hand-typed subset of the Plugin API (`client/figma/api.ts`), bundled by esbuild into one plain script; each script is `const D=<data>;`, the builder, and one step. Every script finds its page, frames and variables by name, so it takes no id, and running it a second time changes nothing. A section over the size limit is split at child boundaries and its later parts continue by a mark in the frame's name, which the closing script removes.
- **The skill passes each script unchanged to `use_figma`**, after the person's yes and one `create_session`, posts images through `upload_assets`, and records the send with `kitvas handoff sent`. Only the skill calls Figma's tools; no command, agent or kitvas code does.
- **What lands:** one page per draft (`kitvas · <slug>`), a frame per width, a frame per section, real text, auto layout where the page uses flex, the kit's tokens as variables in one collection per kit with one mode. A kit component arrives as a plain frame named after it.
- **A send never overwrites.** A second send adds frames beside the earlier ones. The record of sends (`handoff.json` beside the draft, at most 50, newest first) keeps each send's file, frames and state; a resumed send keeps one entry.

## Turned down

- **The page captured by Figma's capture tool.** Cheap and pixel-true, but its script must run inside the built page, which the prototype origin's content policy forbids, and its layers carry no kit names and no variables.
- **A Code layer.** Runnable code, not layers a designer edits.
- **Scripts the model writes on each run.** Different every time and not testable; the generated scripts run on a fake Plugin API in the tests.
- **Local Figma components from measured boxes, or instances of the person's library.** The first would have no variants or properties; the second needs what only a real file shows, so it waits for a later plan.
- **Updating earlier frames in place, and refusing a draft that fails its checks.** In-place updates need an id on each layer that these scripts cannot store; a draft with findings is sent after the person is told and says yes.
- **kitvas calling Figma's API with a key of its own.** The owner's rule (D1): the person's own MCP, optional, as when a kit is read from Figma.
