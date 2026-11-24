# kitvas

kitvas is a Claude Code plugin that builds UI prototypes from your project's own design system, checks them, and shows them in a local studio where you can edit them.

It is for a developer who has to ship a screen with no designer at hand: you go from an idea to a checked prototype on your own machine.

Status: 0.1.0, early. Prototypes are React (with SCSS, or Tailwind v4 when the kit uses it), whatever technology your application uses, because kitvas never writes into your application.

## Why

- **Generated UI ignores your design system.** kitvas builds only from a kit: the catalog of components, tokens and icons it learned from your project. Without one it uses a built-in kit, Base.
- **Nobody checks the result.** kitvas builds the draft, type-checks it, applies the kit's rules, and opens the page in a real browser at 390 and 1280 px in every state. Each finding has a place, a message and a hint.
- **Changing one detail means prompting again.** The studio's editor writes your change into the draft's own TSX or SCSS, touching only the lines it changes.
- **Generated code lands in your application.** Everything stays under `.kitvas/` in your project until you export it.

## How it works

One screen takes this path:

1. A kit supplies the components, tokens and icons: one learned from your project, or Base.
2. The skill writes a brief, then plans the sections in `layout.md`. One agent writes the TSX and SCSS of each section.
3. `kitvas build` bundles the version into a page.
4. `kitvas check` runs the build, types, the kit's rules and the browser checks, and a fix round follows when there are findings.
5. The studio shows the version at every width, state and version, with the findings marked on the page.
6. Your feedback, in chat, as notes in the studio or as edits in the editor, goes into the next version.

```text
 you ── Claude Code ── skills ── kitvas commands ── .kitvas/drafts/<slug>/v<N>/
                          │            │
                          │            └── local studio (127.0.0.1) ── your browser
                          └── agents write section files only
```

Where things live:

| Place                            | Holds                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.kitvas/` in your project       | `config.json`, `kits/` (kits you learned), `additions/` (what craft added), `drafts/<slug>/v<N>/` (md, src, build)                                                    |
| `~/.kitvas/` in your home folder | `config.json` (the studio's look), `data/` (the plugin's npm packages, Chromium in `data/browsers/`, the studio's state files), `data-dir` (where the data folder is) |
| The studio                       | A local process that serves pages and prototypes on 127.0.0.1 until it is stopped                                                                                     |

Claude Code runs the skills and the commands. The plugin's agents only write files; each runs on Sonnet:

| Agent             | Writes                                                      |
| ----------------- | ----------------------------------------------------------- |
| `kitvas:maker`    | The TSX and SCSS of one section of a draft                  |
| `kitvas:patcher`  | Fixes for check findings in a draft's files                 |
| `kitvas:learner`  | A kit's files from an npm package or a folder of components |
| `kitvas:tailor`   | A kit from a Figma file, a website scan or screenshots      |
| `kitvas:sketcher` | Three sketches of a component, icon or logo for craft       |
| `kitvas:scout`    | A research note from the public web                         |

Commands appear below as `kitvas <command>`. That is shorthand, explained in [Commands](#commands).

## Requirements

- Claude Code.
- Node 24.22.3 or later in the 24 line, or 26.13.1 or later.
- Access to the npm registry during the first session.
- Chrome, Edge or Chromium for the browser checks. `kitvas browser` says which one is used; `kitvas browser install` downloads Chromium when none is found.

## Install

```bash
claude plugin marketplace add pglejzer/kitvas
claude plugin install kitvas@kitvas
```

Inside Claude Code the same works as `/plugin marketplace add pglejzer/kitvas` and `/plugin install kitvas@kitvas`.

On the first session after an install or an update, a `SessionStart` hook runs `npm ci --ignore-scripts` for the plugin's own packages in the plugin's data folder. No install script of a dependency runs.

## Quick start

In your project folder, in Claude Code:

1. Type `/kitvas`. It reports whether kitvas is ready and what is missing, and offers to create the `.kitvas/` workspace.
2. Choose a kit. If your project has a design system, type `/kitvas:learn`; otherwise go on with Base.
3. Type `/kitvas:compose` with a description, for example `/kitvas:compose a pricing page with three plans and a FAQ`. Claude asks at most three questions, builds the sections, checks them and fixes what it can.
4. Open the link Claude gives you. It is a one-time link, valid for 60 seconds, to `http://kitvas.localhost:<port>/`. Your browser then stays signed in for 30 days.
5. Give feedback in chat, leave a note in the studio, or switch to Edit and change the draft yourself. Each round makes a new version.

## Skills

| Skill                  | You give                                                                     | You get                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/kitvas`              | Nothing                                                                      | Whether kitvas is ready, the kit in use, the workspace                        |
| `/kitvas:compose`      | A description of a screen, or feedback on a draft                            | A built and checked draft, and a studio link                                  |
| `/kitvas:rework`       | A page you have: a URL, a screenshot or a Figma link                         | A better version in your kit, checked against a list of things that must stay |
| `/kitvas:craft`        | A missing component, icon or logo, and an example                            | Three sketches; the one you pick goes into your kit's additions               |
| `/kitvas:learn`        | A design system: a package, a folder, a Figma file, a website or screenshots | A kit in `.kitvas/kits/<id>/`                                                 |
| `/kitvas:kit`          | A question about the kit                                                     | Its components, tokens and icons                                              |
| `/kitvas:edit <draft>` | An open studio editor                                                        | Claude answers its requests while you edit                                    |

Rework keeps the content and purpose and may change the layout. The report says how many of the original's problems are gone.

## Your design system

A kit describes one design system: components, tokens and icons. The rework and craft skills look for yours first (`kitvas kit detect`) and offer to learn it before they fall back to Base.

kitvas can learn from:

- an npm package (public or private) or a folder of your own components, with Tailwind v4 supported;
- a Figma file, read through your own Figma MCP;
- a website, or screenshots.

To set one up:

1. If it is a package, install it in your project yourself. kitvas never installs a design system.
2. Run `/kitvas:learn`. The kit lives in `.kitvas/kits/<id>/`; commit it to share it with your team.
3. `kitvas kit verify <id>` checks the kit against your real packages: imports, types, every example rendered in the browser, and the tokens. `/kitvas:learn` fixes what it reports.
4. `kitvas kit use <id>` makes it the project's kit.

What craft adds goes to `.kitvas/additions/<kit-id>/`, next to the kit, never into the kit's package.

## Checks

`kitvas check <draft>` builds a draft and checks it: the build, types, the kit's rules, and the page in a browser at 390 and 1280 px, in every state. The browser checks cover accessibility, the look (`ui`), the flow (`ux`) and errors at runtime. `--deep` adds the slower checks; compose uses it before it hands over a final version.

Every finding has a place, a message and a hint. A finding you accept on purpose, with a reason, is kept in the draft's `waivers.json` and is left out of the count. `kitvas guidelines` lists the rules, each with the guidance it is based on.

## The studio and the editor

`kitvas studio --open` opens the project's studio. It shows a gallery of drafts; each draft at every width, state and version, with findings marked on the page; two versions side by side (a rework also next to its original); a craft draft's sketches; and your kit's tokens, components and examples.

A draft is deleted from its card in the gallery or from the editor's menu. It moves to Deleted (the folder `.kitvas/trash/`), where it can be restored or removed for good.

Switch a draft to Edit to change it by hand:

- a kit component's props, and spacing, colour, typography, radius, border and size, with the kit's tokens offered first;
- text, by a double click;
- structure: drag, insert, delete, wrap and reorder elements and sections;
- widths and states: an edit at 768 or 1280 px is written as a media query, a hover or focus edit as `&:hover` or `&:focus-visible`;
- live findings after each edit, with Apply for a target that is too small and for text of too low contrast.

Everything above works with no network, no account and no model: the studio, the edits, the builds, the checks and the versions. The AI tab (variants for a sentence or "Improve"), requests for changes kitvas cannot write itself, and the reasons behind a section need a listening session: run `/kitvas:edit <draft>` in Claude Code and leave it running.

The full guide, with every key and rule, is in [docs/editor.md](docs/editor.md).

## Commands

There is no global `kitvas` command. The package is private and not on npm. Claude Code runs the commands from the skills as `node "${CLAUDE_PLUGIN_ROOT}/bin/kitvas.ts" <command>`, so the normal way to run one is to ask Claude in plain words: "open the studio", "check the pricing draft".

By hand, run `node <plugin folder>/bin/kitvas.ts <command>` from your project folder. An installed plugin's folder is `~/.claude/plugins/cache/<marketplace>/kitvas/<version>/`. This works after the first session, because the hook records where the packages were installed. In this README `kitvas <command>` is short for that.

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

## What leaves your machine

- The studio binds to 127.0.0.1 and needs no account. Pages need a cookie that only a one-time link gives. Prototypes run in a sandboxed frame on a second port.
- kitvas itself calls the network in three cases: the npm install of its own packages, the Chromium download when you ask for it, and a page you ask it to read. A local or private address is refused unless you pass `--allow-private`.
- The `kitvas:scout` agent searches the public web through Claude Code's own tools. Its queries carry only the public terms of a question, never your name, paths, code or draft text (`reference/scout.md`).
- Figma is read only through your own Figma MCP. kitvas holds no key.
- kitvas sends your drafts to nobody. Claude Code itself sends what it reads to the model, as in any session. That is not a kitvas feature, and it applies to the files of a draft Claude reads.

See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md) for the model and the controls.

## When something does not work

Run `kitvas doctor`. It checks Node, packages, the plugin, the workspace, the kit, the browser, the data and drafts folders, the ports and the studio's recent errors, and says what to do for each check that is not ok. It changes nothing that lasts.

`kitvas doctor --report` prints text to paste into an issue. It writes your home folder as `~` and the project folder as `<project>`, and leaves out names and addresses.

Open an issue at https://github.com/pglejzer/kitvas/issues. Report a vulnerability through [SECURITY.md](SECURITY.md), not as a public issue.

## Limits

- kitvas is early (0.1.0).
- Prototypes are React only.
- kitvas will not write into your application's code. Everything goes to `.kitvas/`, or to a folder you name when you export.
- kitvas will not open a local or private address you give it, unless you allow it with `--allow-private`.
- kitvas will not copy an example. A page, screenshot or logo you show gives the idea and the style, never a traced copy.
- The editor refuses a change it cannot write safely, such as a text from a prop or a call, and hands it to Claude with the reason. See [docs/editor.md](docs/editor.md).

## Develop

```bash
npm ci --ignore-scripts
npm run check
```

`AGENTS.md` has the rules. `docs/adr/README.md` indexes the decisions. `CHANGELOG.md` lists the changes. `evals/README.md` explains the skill evals.

## License

[PolyForm Shield 1.0.0](LICENSE.md). You may use, change and share kitvas for any purpose, at work too, except to sell it or to build a product that competes with it.
