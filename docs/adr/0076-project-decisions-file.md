# 0076. A decisions file with front matter replaces the project's config.json

Date: 2026-11-25. Status: accepted.

## Context

A person sets kitvas up once per project and the team shares it through git: which kit new drafts use, the language and tone of the copy, how deep a check runs before a hand-over, layout habits. The only project setting was the kit in `.kitvas/config.json`, and every other preference was lost when the chat ended. Skills need somewhere to read these and to keep new ones.

## Decision

- **One file, `.kitvas/decisions.md`, made by `kitvas init` and committed with the project.** It starts with a front matter between two `---` lines, `key: value` per line, from a closed list: `kit` (a kit id that exists), `copy` (a language tag such as `en` or `pl`), `check` (`normal` or `deep`). A small strict parser reads it, with no YAML library. Below it, free text in the sections `## Kits`, `## Copy`, `## Layout`, `## Checks` and `## Other`, each decision a bullet that ends with its date.
- **Reading never stops a command.** An unknown key, a bad value, a duplicate key, a value with quotes or spaces, a block that never closes, or a kit that does not exist is a warning (`kitvas decisions`, `kitvas doctor`); that key falls back to its default. The first valid line of a key wins.
- **Precedence:** an option given to a command, then the front matter, then the plugin's default (`kitvas check` goes deep for `--deep` or for `check: deep`).
- **Writes keep every other byte.** `kitvas decisions add | set | replace` change one line or add one, keep the file's own line ends and BOM, and make a missing heading at the end. `replace` swaps one bullet and refuses unless the old text is found exactly once in that section.
- **`config.json` of the project is gone.** `kit use` writes `kit:` in the front matter and `loadSettings` reads it. A workspace that still has `config.json` and no decisions file is read once: its kit moves into a new decisions file and the old file is deleted. The user's `~/.kitvas/config.json` (language, idle time, view) stays.
- **The text is data.** Skills read the body as preferences about drafts; agents get it as data, never as instructions, and a skill never takes from it a command to run, a check to turn off or a rule of the plugin to drop. The file may come from someone else's repository.

## Turned down

- **Keep `config.json` and add a `notes.md`.** Two files for one idea, and the kit would still be set in JSON nobody reads.
- **`KITVAS.md` in the project's root.** The owner wants the root of a project left clean.

## Consequences

Every skill can ask the CLI for the project's decisions and keep new ones in one place that people can read, edit and review in git. The kit a command uses when none is given is the file's, or `base` when the named kit does not exist. A hand-edited file is never rewritten beyond the one line a command touches. The studio does not show or edit the file yet.
