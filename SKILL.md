---

name: kitvas
description: Sets up and reports the state of kitvas, the plugin that builds UI prototypes from any design system, in any project, and checks them in a local studio. Use when the user runs /kitvas, asks whether kitvas is ready, or wants to start using it in a project.
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
    "version": "0.1.0",
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

## 3. Report

Tell the user in their language: the kitvas version, the kit in use, and where the workspace is.
