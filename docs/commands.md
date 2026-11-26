# Commands

Every kitvas command. For the rest of kitvas, see the [README](../README.md).

There is no global `kitvas` command. The package is private and not on npm. Claude Code runs the commands from the skills as `node "${CLAUDE_PLUGIN_ROOT}/bin/kitvas.ts" <command>`, so the normal way to run one is to ask Claude in plain words: "open the studio", "check the pricing draft".

By hand, run `node <plugin folder>/bin/kitvas.ts <command>` from your project folder. An installed plugin's folder is `~/.claude/plugins/cache/<marketplace>/kitvas/<version>/`. This works after the first session, because the hook records where the packages were installed. In these docs `kitvas <command>` is short for that.

Every command takes `--json` and answers `{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`.

| Command      | What it does                                                                             |
| ------------ | ---------------------------------------------------------------------------------------- |
| `status`     | Shows the version, settings and workspace                                                |
| `init`       | Creates the `.kitvas` folder in this project                                             |
| `kit`        | Lists, shows, checks, learns, verifies and selects kits                                  |
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
