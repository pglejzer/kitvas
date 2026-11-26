# How it works

How kitvas turns an idea into a checked prototype. For what kitvas is and how to install it, see the [README](../README.md).

One screen takes this path:

1. A kit supplies the components, tokens and icons: one learned from your project, or Base.
2. The skill writes a brief, then plans the sections in `layout.md`. One agent writes the TSX and SCSS of each section.
3. `kitvas build` bundles the version into a page.
4. `kitvas check` runs the build, types, the kit's rules and the browser checks, and a fix round follows when there are findings.
5. The studio shows the version at every width, state and version, with the findings marked on the page.
   A version may also hold options, declared in `src/json/options.json`. Each section takes them as a prop beside `state`, and the page's root carries `data-opt-<id>="<value>"`. A value is a condition in the one source, so there is one build and the studio switches by drawing again. The check visits each other value, one at a time, at two widths; hand-off takes the default combination. Adding or dropping an option is a new version.

   A version may hold shared values too, declared in `src/json/shared.json`: what a person chooses while using the page, such as a date range or a search text. Every section takes `shared` and `setShared` as props, so a control in one section changes what another shows. The values live in the page, not in a section, and stay when the studio brings in a new build.
6. Your feedback, in chat, as notes in the studio or as edits in the editor, goes into the next version.

```text
 you ── Claude Code ── skills ── kitvas commands ── .kitvas/drafts/<slug>/v<N>/
                          │            │
                          │            └── local studio (127.0.0.1) ── your browser
                          └── agents write section files only
```

## Where things live

| Place                            | Holds                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.kitvas/` in your project       | `decisions.md` (the project's settings and decisions, shared through git), `kits/` (kits you learned), `additions/` (what craft added), `drafts/<slug>/v<N>/` (md, src, build, handoff) |
| `~/.kitvas/` in your home folder | `config.json` (the studio's look), `data/` (the plugin's npm packages, Chromium in `data/browsers/`, the studio's state files), `data-dir` (where the data folder is) |
| The studio                       | A local process that serves pages and prototypes on 127.0.0.1 until it is stopped, or until 240 minutes pass without use (`studioIdleMinutes` in `config.json`; 0 never stops it)                                                                                     |

## Agents

Claude Code runs the skills and the commands. The plugin's agents only write files; each runs on Sonnet:

| Agent             | Writes                                                      |
| ----------------- | ----------------------------------------------------------- |
| `kitvas:maker`    | The TSX and SCSS of one section of a draft                  |
| `kitvas:patcher`  | Fixes for check findings in a draft's files                 |
| `kitvas:learner`  | A kit's files from an npm package or a folder of components (several at once for a whole package) |
| `kitvas:tailor`   | A kit from a Figma file, a website scan or screenshots      |
| `kitvas:sketcher` | Three sketches of a component, icon or logo for craft       |
| `kitvas:scout`    | A research note from the public web                         |
| `kitvas:fitter`   | A finished draft in your project's own technology, and a report |

Commands appear in these docs as `kitvas <command>`. That is shorthand, explained in [Commands](commands.md).
