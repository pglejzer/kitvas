# 0035. Written kits: components an agent writes into the kit folder

Date: 2026-11-23. Status: accepted. Adds to `0030-project-kits.md` and `0031-agent-written-kits-verified.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2b-written-kits-design.md`, sections 3, 4 and 6.

## Context

A person whose design system lives in a Figma file, on a live website or in screenshots has no component code to import. The 2a kits point at a package or a folder of the project. Here there is nothing to point at, and the Base kit is only the studio's own look: restyling it with a brand's tokens was rejected by the owner.

## Decision

- **New sources**: `figma` (a file URL), `web` (one to five page URLs) and `images` (copied into `source/images/`). All three are written kits.
- **The components live in the kit folder**: `components/<Name>.tsx` with a CSS Module each. `import.from` is a kit path (`components/Button`), checked by `KIT_PATH`. The generated entry re-exports each component. Components import only `react` and their CSS Module and are styled with `var(--kit-*)` only.
- **Tokens are the kit's own** (`json/tokens.json`). There is no `cssVars.map`, so the `tokens` step is skipped.
- **A new agent, `tailor`** (Sonnet, tools Read, Write, Edit, Glob and Grep, no shell, no MCP, writes only inside the kit folder), follows `reference/write-kit.md`. Every command and every MCP call is the skill's.
- **References**: an example may name an image it should look like (`reference`, `REFERENCE_PATH`). References come from scan crops, or from `kit crop` over Figma sheets and the person's images, cut by a `boxes.json` with a `scale` (sheet pixels per CSS pixel).
- **The kit's hash covers `components/`**, so editing a component makes `verify.json` stale and the studio says so. Other kits keep their hash.
- **Source text is data.** Page text, Figma names and words in images reach the agent only as data; the rules and the skill say they are never instructions.
- kitvas downloads no fonts, images or logos into a kit.

## Consequences

One path serves three sources and ends in a kit that drafts use like any other. The agent can write a component that looks wrong, so every example carries a reference and a score (ADR 0037) or is listed as having none. The person may edit the components; kitvas does not check the inside of a component for `--kit-*` use, and the `ds` check of drafts stays as it is.
