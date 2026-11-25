---

name: kitvas
description: Use when the user runs /kitvas, asks whether kitvas is ready, or wants to start using kitvas (UI prototypes from any design system, checked in a local studio) in a project.
---

# kitvas: setup and status

Run every command from the user's project folder. `KITVAS` below means:

`node "${CLAUDE_PLUGIN_ROOT}/bin/kitvas.ts"`

## 1. Status

Run `KITVAS status --json`.

Example output:

```json
{
  "ok": true,
  "data": {
    "version": "1.0.0",
    "node": "v26.13.1",
    "language": "en",
    "kit": "base",
    "workspace": { "path": "/work/shop/.kitvas", "exists": false }
  }
}
```

On `"ok":false` show `error.message` to the user and stop. Exit code 5 means Node is too old: the user updates Node, not you.

## 2. Workspace

If `workspace.exists` is false, ask the user whether to create it in this folder. On yes run `KITVAS init --json`.

## 3. When something does not work

Run `KITVAS doctor --json`: it probes Node, packages, plugin, workspace, kit, browser, folders, ports and the studio's recent errors, and says what to do for each check that is not `ok`; add `--report` for text the user can paste into an issue.

## 4. Deleting a draft

Delete a draft only when the user asks for it: `KITVAS draft delete <slug> --json`. It moves the draft to the trash, it does not destroy it, and the answer names the command that brings it back: `KITVAS draft restore <slug>`. `KITVAS draft list --deleted` shows what is in the trash. Run `KITVAS draft purge <slug>` (or `--all`) only after the user says yes to losing that draft for good: it removes it from disk and cannot be undone.

## 5. Report

Tell the user in their language: the kitvas version, the kit in use, and where the workspace is.
