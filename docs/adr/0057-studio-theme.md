# 0057. The studio's own theme

Date: 2026-11-24. Status: accepted, changed in part by ADR 0068. Spec: `docs/specs/2026-11-24-kitvas-studio-redesign-design.md`, Part 1. Replaces the rule that the studio's skin takes its colours, sizes and type from the Base kit's tokens: that rule stood behind ADR 0018 and was repeated in ADR 0054, which left the look plain "until a studio-wide design pass". This is that pass. Builds on ADRs 0018, 0042 and 0054.

## Context

Stages 1 to 4d built what the studio does. How it looks was left plain on purpose, with the Base kit's quiet tokens, and the owner found the result too plain to keep. The owner chose a direction (a graphite shell, panels as islands, an icon rail, one accent), two themes, a Cards and a Flush layout, a typeface, and an accent he can change. The Base kit is the kit of the person's drafts: its look must not change because the studio's did. And the frame draws over a draft (the selection, handles, marks and pins), so it needs colours that belong to the studio and show on any draft.

## Decision

- **The studio has tokens of its own.** `src/studio/theme/` holds them: `tokens.ts` the values (colours for dark and light, four accents, radius, space, type, shadows, motion, sizes), `theme-css.ts` the custom properties (`--st-*`) written into every page, and `contrast.ts` the WCAG arithmetic. The Base kit is untouched. A rule of the skin reads only `var(--st-…)`.
- **Light and dark, Cards and Flush, four accents** (Copper by default, Teal, Coral, Rose) are the person's settings: a `view` block in `~/.kitvas/config.json`, read and written through `/api/v1/settings/view` (the `write` policy). The server puts `data-theme` (absent for the system's choice), `data-panels` and `data-accent` on `<html>`, so a page never flashes the other theme. The View popover in every page's bar changes them at once, without a reload, and never reloads a frame. Cards and Flush are the same markup; only the CSS differs.
- **Figtree** (`@fontsource-variable/figtree`, loaded through `src/shared/deps/`) is served by the studio from `/assets/` behind the page cookie, Latin and Latin Extended. Without the file the studio falls back to `system-ui`. Code, token names and commands stay in the system monospace font.
- **The studio has icons of its own** (`src/studio/pages/icons/`): a small set of stroke icons on a 16 px grid, as one sprite per page. A control with only an icon has an accessible name and a title.
- **One shared skin and one file per area.** The shared classes (`k-…`: buttons, fields, chips, menus, items, tabs, rows, islands) are in `src/studio/pages/skin/`; each page or editor area has one file (`skin/pages/`, `skin/editor/`) with classes of its own prefix. An area never defines a shared class. Tests fail on a colour written by hand, a token that is not defined, `ink-soft` used as text, a gradient, a blur, an all-caps label, a motion time written by hand, and a `--kit-` name.
- **Contrast is tested, not assumed.** A test computes the WCAG ratio of every pair the skin uses, in both themes and for all four accents: text on its surfaces at 4.5 to 1, the accent as a mark and the selection colour at 3 to 1. A value that fails is moved in lightness only; its hue stays. The accent is for the selection, focus, the primary action and the active item; the tones fix, review and good say a state and never decorate.
- **The frame's overlays take the studio's tones from a fixed table, by name.** The studio page sends the names of its theme and accent (the `tones` message). The table is in `client/frame/tones/tones.ts`; a test holds it equal to `src/studio/theme/tokens.ts`. Each overlay calls `toned(host)` once for its host, which sets `--kv-select`, `--kv-on-select`, `--kv-fix`, `--kv-review`, `--kv-good` and `--kv-on-tone` on that host only. A sheet reads them as `var(--kv-…, <system colour>)`, so an overlay of a prototype opened on its own, or of an older studio, shows the system colours of today. A message never carries a colour: only names that the table knows are taken. Everything stays inside the overlay's closed shadow root and never reaches a build or a draft's files. A test reads every overlay sheet and fails on a literal colour, a `--kit-` name or a `--kv-` name without a system colour behind it.
- **The anti-slop rules reach the agents.** The owner's rules against the generic look of generated screens bind the studio and everything kitvas generates. `reference/anti-slop.md` is their tracked form for the agents that write drafts, components, icons and logos; the compose and craft references, the maker, the sketcher and the patcher point to it.

## Consequences

- The studio and a draft no longer share a look: the studio's tokens never reach a build, and the kit's never reach a studio page, except inside the frame where the kit is the subject.
- Eight overlays of the frame change colours only. No geometry, pointer rule or message of theirs changes.
- The view is the person's, not the project's: it holds in every project and under every host name, and survives a restart. Another open studio page follows on its next load.
- One more dependency (OFL-1.1, older than 14 days). The table of tones is written twice (the theme and the frame bundle, which imports nothing from `src/`) and a test keeps the two equal.
- `src/studio/AGENTS.md` and `AGENTS.md` change: the skin takes its values from the studio's tokens, not from Base.

## Rejected

- **A dark set and an accent in the Base kit.** It would change every draft made with Base, and the kit's quiet look is what its users chose.
- **`localStorage` for the view.** It is kept per port and host name, so per project, and a script before the first paint would be needed to avoid a flash of the other theme.
- **A link to a font service.** The page policy forbids it, the studio must work offline, and the link would tell a third party about the person.
- **An icon package.** About forty icons do not need one, and a package would bring styles of its own.
- **A free accent colour, or taking the accent from the project's kit.** The owner chose four accents and a setting; a free colour cannot be tested for contrast.
- **Restyling the old CSS and keeping the old markup.** The rail, the islands, the pills and the cards in the tabs need other markup, and a restyle of the stage 4b screen is what the owner turned down.
