# 0036. The website scanner

Date: 2026-11-23. Status: accepted. Adds to `0035-written-kits.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2b-written-kits-design.md`, sections 5 and 9. Evidence: `docs/spikes/12-website-scan.md`.

## Context

A website is the source most people have. Reading it through the person's browser MCP would make the result depend on a tool kitvas does not control, give no repeatable test and leave private addresses unguarded. The scanner is the only new outbound request kitvas makes.

## Decision

- **`kitvas kit scan <id> [--url <url>]... [--allow-private]`** runs kitvas's own Playwright: one page per URL, at most five per kit, at widths 1280 and 390 px, 900 px high, `load` plus 2 s, 45 s per page.
- **Output** under `source/web/<n>-<width>/`: `page.png` (full page, at most 8000 px high), `facts.json` and `crops/`. Facts hold colours, families, type, spacing, radii, shadows, borders, root variables, breakpoints and candidates (at most 12 per kind, 300 crops per kit, 20 MB per page).
- **Text** is cut to 80 characters and stored only as `{ "pageText": "…" }` values, never as keys, so the agent can tell page text from facts.
- **Findings from the spike**: crops are widened by the element's shadow reach (at most 16 px a side); candidates in `main` come first and banners last; same-origin iframes are scanned like the page. A page with no candidates still writes facts, with an empty list.
- **Private addresses are refused** unless `--allow-private`: loopback, private, link-local, unique-local and unspecified addresses, IPv4-mapped IPv6 judged by its IPv4, and a name that resolves to any of them. Every request and every redirect hop is checked. Only `http` and `https`, no user info (`SCAN_BLOCKED`, exit 37). A page that does not load is `SCAN_FAILED`, exit 38.
- **The browser** is a fresh context with no stored state, service workers blocked, downloads off and no permissions. It never clicks.
- Pages behind a login are not scanned. The person's own browser MCP (optional) or screenshots cover them.

## Consequences

The website path works for everyone, is testable against a fixture site on 127.0.0.1 (tests pass `--allow-private`) and cannot be pointed at the person's own network without them saying so. A site that blocks headless browsers fails with a message; screenshots are the fallback.
