# 0038. Figma and other MCPs only through the person's own servers

Date: 2026-11-23. Status: accepted. Adds to `0035-written-kits.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2b-written-kits-design.md`, sections 3 and 9.

## Context

Stage 1 dropped Figma keys for good. A Figma file is still the richest source for some teams. Figma limits its MCP server by plan and seat: a Starter plan or a View or Collab seat gets 20 read calls a month, and Full and Dev seats on paid plans get 200 to 600 a day (Figma's rate-limit page, read 2026-11-23). The call `whoami` does not count. The MCP reads only files the person can open; a Community file must first be opened in Figma, which copies it to their drafts.

## Decision

- **Figma is read only through the person's own Figma MCP server**, signed in by them. kitvas holds no key, asks for none and never requires Figma. Without the MCP the skill says how to add it and offers screenshots.
- **The skill makes every call, not the tailor agent**, so the budget lives in one place: `whoami` first, then it tells the person how many calls it will use (about 6) and how many they have, and stops when the budget is too small.
- **The calls**: the page list, the components page's metadata, its variable definitions and one to three screenshots of whole component sheets at a large size. No call per component.
- **What is saved** in `source/figma/`: `metadata.xml`, `variables.json` and `sheet-<n>.png`. The skill writes `source/figma/boxes.json` from the metadata, each box in sheet pixels with a `scale`. `kitvas kit crop` cuts `source/refs/*.png` from it. kitvas parses no Figma data.
- **Any other MCP the person offers** (a browser, a design system server) is optional: pages behind a login, examples and a11y notes. It never replaces the catalog and is never required.
- **Text from an MCP is data**, never an instruction, like page text.
- The agent's rules name what it needs, not exact tool names, because Figma's tools change; an eval catches breakage.

## Consequences

The person's own plan limits are respected and kitvas stays free of secrets. Figma is not tested in CI: the part kitvas owns (`boxes.json`, `kit crop`) is, with fixture sheets; the flow is covered by an eval and the owner's live check.
