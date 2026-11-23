# Skill evals

Evals for the three skills of the plugin, in the format of `claude plugin eval`:

- `evals/kitvas/`: `/kitvas` (status, init, language). Cheap, tagged `smoke`.
- `evals/kit/`: `/kitvas:kit` (components, tones, a missing component). Cheap, tagged `smoke`.
- `evals/compose/`: `/kitvas:compose` (a screen, states, a second version). Tagged `slow`: one run each, minutes per case.

A case is a folder with `prompt.md` (the user's message and the run limits) and `graders/*.md`
(`tool_used`, `regex`, `file_exists`, `llm`). The truth for components, props and tones is
`kits/base/kit.json`; graders must never reward a name that is not in it.

## Run

Run from the plugin folder. The tools flag is needed because the skills run Bash and write files.

```bash
claude plugin eval . --allow-tools Bash Write Edit --tag smoke --model haiku
claude plugin eval . --allow-tools Bash Write Edit --tag smoke --model sonnet
claude plugin eval . --allow-tools Bash Write Edit --tag smoke --model opus
claude plugin eval . --allow-tools Bash Write Edit --tag slow --scaffold --model sonnet
```

Every case grants Bash, and `claude plugin eval` runs a granted shell only inside its OS sandbox.
On Windows that sandbox is not available yet (checked 2026-11-23, Claude Code 2.1.330: the runs are
refused), so run the evals on Linux or macOS with the sandbox backend installed.

`--scaffold` is needed for `compose/second-version`: its `scaffold.sh` creates a built draft first and
finds the CLI through `CLAUDE_PLUGIN_ROOT`. It stops with a message when that is not set.

Results go to `evals/results/`, which is git-ignored.
