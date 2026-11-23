---

name: kit
description: "Shows what the current kit (design system) of a kitvas project offers: its components with props and examples, its tokens and icons, and whether the kit is valid. Use when the user asks which components, tokens or icons are available, how to use one component, or whether the kit is fine, and before writing prototype code that uses a kit."
---

# kitvas: the kit

A kit describes one design system: components, tokens, icons. Read it through the CLI; do not open the kit's files to find out what exists.

`KITVAS` below means: `node "${CLAUDE_PLUGIN_ROOT}/bin/kitvas.ts"`. Run it from the user's project folder. Every command takes `--json`; the answer is `{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`.

## Commands

| Need                                                 | Command                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Which kits exist                                     | `KITVAS kit list --json`                                                    |
| The project's kit: components, counts, gaps          | `KITVAS kit show --json`                                                    |
| One component: props, defaults, examples, a11y notes | `KITVAS kit component <Name> --json`                                        |
| The token sheet (`--kit-*` custom properties)        | `KITVAS kit css`                                                            |
| Is the kit valid                                     | `KITVAS kit check --json`                                                   |
| Rendered examples for the studio's kit page          | `KITVAS kit build --json`                                                   |
| Create a project kit skeleton (then `/kitvas:learn`) | `KITVAS kit new <id> --from npm:<package>` or `--from repo:<folder> --json` |
| Verify a project kit: imports, types, render, tokens | `KITVAS kit verify [id] --json`                                             |
| Make a kit the project's kit                         | `KITVAS kit use <id> --json`                                                |

Add a kit id as the last argument to read a kit other than the project's. Kits come from two places: built-in ones, and project kits in `.kitvas/kits/` that `/kitvas:learn` writes from the project's own design system. To learn one, use the learn skill; never write a kit's files yourself.

## Rules

- Use only components, props, values and icon names the catalog lists. If something is missing, say so; do not invent it.
- Import components from `@kit`: `import { Button } from '@kit'`.
- In styles use `--kit-*` custom properties, never raw colours or sizes.
- `gaps` in `kit show` lists what the kit's source did not provide. Treat it as unknown, not as absent by design.
- On `"ok":false` show `error.message` to the user and stop. Exit code 6: the kit does not exist. Exit code 7: the kit is broken; run `KITVAS kit check <id>` and show the problems.

## Example

```json
{
  "ok": true,
  "data": {
    "view": "component",
    "id": "base",
    "component": {
      "name": "Badge",
      "category": "display",
      "description": "A short status label.",
      "props": [
        {
          "name": "tone",
          "type": "enum",
          "values": ["neutral", "fix", "review", "good"],
          "default": "neutral"
        },
        { "name": "children", "type": "node", "required": true }
      ],
      "examples": [
        {
          "title": "Needs a fix",
          "code": "<Badge tone=\"fix\">1 to fix</Badge>",
          "imports": ["Badge"]
        }
      ]
    }
  }
}
```
