# Commands

Every kitvas command. For the rest of kitvas, see the [README](../README.md).

There is no global `kitvas` command. The package is private and not on npm. Claude Code runs the commands from the skills as `node "${CLAUDE_PLUGIN_ROOT}/bin/kitvas.ts" <command>`, so the normal way to run one is to ask Claude in plain words: "open the studio", "check the pricing draft".

By hand, run `node <plugin folder>/bin/kitvas.ts <command>` from your project folder. An installed plugin's folder is `~/.claude/plugins/cache/<marketplace>/kitvas/<version>/`. This works after the first session, because the hook records where the packages were installed. In these docs `kitvas <command>` is short for that.

Every command takes `--json` and answers `{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`.

| Command      | What it does                                                                             |
| ------------ | ---------------------------------------------------------------------------------------- |
| `status`     | Shows the version, settings and workspace                                                |
| `init`       | Creates the `.kitvas` folder in this project                                             |
| `kit`        | Lists, shows, checks, learns, verifies and selects kits; `exports`, `merge` (below)      |
| `draft`      | Creates, lists and shows drafts, starts a new version; `delete`, `restore` and `purge`   |
| `craft`      | Makes sketches of a component, icon or logo, picks one, adds it to the kit or exports it |
| `rework`     | Starts a better version of a page from a URL or images                                   |
| `layout`     | Checks a draft's `layout.md` against the kit and writes its entry files                  |
| `context`    | Gives an agent what it needs to write one section                                        |
| `map`        | Lists a draft's sections, files and element ids for agents                               |
| `build`      | Builds the latest version of a draft into a page                                         |
| `check`      | Checks the latest version against the kit; `--deep` for the slower checks                |
| `browser`    | Shows the browser the checks use; `browser install` downloads Chromium                   |
| `doctor`     | Checks the setup and says what is wrong                                                  |
| `studio`     | Starts the project's studio and prints its address; `studio status`, `studio stop`       |
| `inbox`      | Waits for notes and requests from the studio and prints them                             |
| `request`    | Reads or answers a request from the editor                                               |
| `guidelines` | Shows the guideline book                                                                 |
| `handoff`    | Writes a draft's Figma package or the fitter's brief; lists, compares and records hand-offs |

## Learning a whole package

`/kitvas:learn` runs these two while it learns a kit from an npm package or a folder of the project (ADR 0081). They take the kit's id; without one, `kit exports` uses the project's kit.

- `kitvas kit exports <id>` lists the component names the kit's source exports: an npm kit's package, or the modules of a repo kit's folder (tests, stories and type files left out). It answers `total`, `covered` (a component of the kit or one of its `parts`) and `open` (the rest, without the names `gaps` holds as `unsupported`). The names are read by bundling the source, never by running it; nothing is installed or written. A kit written from Figma, a website or images has nothing to list (`KIT_SOURCE_INVALID`), and a package that is not installed is `KIT_PACKAGE_MISSING`.
- `kitvas kit merge <id>` puts the fragments in `<kit>/parts/` into `kit.json`. A fragment is `<name>.json` (lower-case letters, digits and `-`, at most 40 characters) holding `components` and, if needed, `gaps`; at most 20 fragments of 2 MiB each. Every fragment is checked against the contract (`reference/kit.schema.json`) first, and a name in two fragments is refused; then a component the kit has is replaced in place, a new one is added at the end, the gaps are joined, `kit.json` is written once and `parts/` is removed. With a problem it writes nothing and answers `merged: false` with the `issues`, each with its `fragment`, `path` and `message`. It never runs `kit verify`; run it next.
