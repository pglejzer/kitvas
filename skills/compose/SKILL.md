---

name: compose
description: "Builds a UI prototype in the user's project from the project's kit: brief, layout, one section per agent, build, checks, fixes, and a link to the studio. Use when the user wants a screen, page or prototype designed and built, or wants a new version of a draft after feedback."
---

# kitvas: compose a draft

A draft is a React prototype built only from kit components and `--kit-*` tokens. You run every command; the agents `kitvas:maker` and `kitvas:patcher` only write files.

`KITVAS` means: `node "${CLAUDE_PLUGIN_ROOT}/bin/kitvas.ts"`. Run it from the user's project folder. Every command takes `--json`: `{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`. On `"ok":false` show `error.message` to the user and stop.

Talk to the user in the user's language. Files you and the agents write are English.

The kit may be built in (Base) or a project kit learned from the user's own design system. Both work the same way here: imports only from `@kit`. `KITVAS context` says `styling: 'tailwind'` for a Tailwind kit; makers then use the theme's utility classes. If the user has no kit of their own and wants one, use the learn skill first.

Rules for the files are in `reference/compose.md` (makers) and `reference/findings.md` (fixes). Pass their absolute paths, `${CLAUDE_PLUGIN_ROOT}/reference/compose.md` and `${CLAUDE_PLUGIN_ROOT}/reference/findings.md`, to every agent you start; the agents cannot expand the variable.

## 1. Status

Run `KITVAS status --json`. If `data.workspace.exists` is false, ask the user, then run `KITVAS init --json`.

## 2. Brief

Ask at most three questions in one message: the goal, the audience, the content and states. Give a safe default for each, and use it when the user does not answer. Then run:

`KITVAS draft new <slug> --title "<title>" --json`

The slug is lower-case words joined by `-`. The answer holds `data.path`, the draft folder. Work in its latest version folder, `v<N>` (new draft: `v1`). Write `v<N>/md/brief.md` with the Write tool, filling the scaffold: goal, audience, real content, states.

## 3. Layout

Write `v<N>/md/layout.md`. One `## <section-id>` heading per section, top to bottom, each with `Purpose:` and `Components:` lines. Choose components with `KITVAS kit show --json`. List the states in `v<N>/src/json/states.json` when the draft has more than `filled`. Then run:

`KITVAS layout <slug> --json`

```json
{
  "ok": true,
  "data": {
    "slug": "shop",
    "version": 1,
    "valid": true,
    "sections": [{ "id": "hero", "component": "Hero", "written": false }]
  }
}
```

If `data.valid` is false, fix the lines named in `data.issues` and run it again. When it is valid, kitvas writes the entry files; never edit them.

## 4. Sections

For each section, run `KITVAS context <slug> --section <id> --json`. Start one `kitvas:maker` agent per section, all in one message so they run in parallel. Each prompt has: the full context JSON, the draft folder, and the path of `reference/compose.md`. Each maker writes the two files named in `files` of the context.

When all makers are done, run `KITVAS layout <slug> --json` again. Every section must show `"written": true`; start a maker again for any that does not.

## 5. Build

Run `KITVAS build <slug> --json`. If `data.built` is false, send the errors to a `kitvas:patcher` (step 7) and build again.

## 6. Check

Run `KITVAS check <slug> --json`.

```json
{
  "ok": true,
  "data": {
    "slug": "shop",
    "version": 1,
    "summary": { "fix": 1, "review": 2 },
    "findings": [
      {
        "rule": "ds/raw-color",
        "severity": "fix",
        "file": "src/scss/sections/hero.scss",
        "line": 4,
        "column": 10,
        "element": null,
        "message": "…",
        "hint": "…"
      }
    ]
  }
}
```

## 7. Fix

If there are findings, run `KITVAS map <slug> --json` (sections with their files; element ids with file, line, column and tag). Start one `kitvas:patcher` with the findings, that map, the draft folder and the path of `reference/findings.md`. Give it all `fix` findings and the `review` ones you judge worth fixing. Then build and check again. At most two rounds. Anything left goes in the report.

## 8. Studio

Run `KITVAS studio <slug> --open --json`. It opens the page in the user's browser. Still give the user `data.openUrl` (and `data.fallbackUrl` if the first does not load): a one-time link that works once, for 60 seconds. If it expires, run the command again for a new one. After the first visit, `http://kitvas.localhost:<port>/` opens without a link for 30 days.

## 9. Next version

The user's feedback comes in chat. Run `KITVAS draft version <slug> --json`, change the layout and the sections that need it (steps 3 to 7), then step 8 again. Notes left in the studio come through `KITVAS inbox --timeout 30 --json`.

## 10. Report

Tell the user: the link, the check results (fixes and reviews left, in plain words), what remains, and one suggested next step. Never say a check passed that you did not run in this version.
