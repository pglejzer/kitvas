# Skill evals

Evals for seven skills of the plugin, in the format of `claude plugin eval`:

- `evals/kitvas/`: `/kitvas` (status, init, language, the doctor, a draft deleted and one brought back).
  Tagged `smoke`.
- `evals/kit/`: `/kitvas:kit` (components, tones, a missing component, spacing tokens, icons, a kit that
  does not exist, a kit that is broken, an order hidden in the project's decisions). Tagged `smoke`.
- `evals/craft/`: `/kitvas:craft` (a near match in the kit, a look word read two ways, a design system not
  learned yet, a name the kit already has, an export; three sketches of an icon, of a new component and of
  a logo, a pick added to the kit). The first five are `smoke`, the four that draw or add are `slow`.
- `evals/rework/`: `/kitvas:rework` (a local address, a design system not learned yet, the protected list
  shown before anything is built, a rework from a screenshot). The first three are `smoke`, `from-image`
  is `slow`.
- `evals/compose/`: `/kitvas:compose` (what is asked before a build: the brief, a lasting choice, a theme
  the kit lacks, a component the kit lacks; then a screen, states, a second version, an option with a
  shared value, the copy language from the project's decisions). The four that stop at a question are
  `smoke`; the five that build are `slow`: one run each, minutes per case.
- `evals/learn/`: `/kitvas:learn` (a kit id that is taken, `smoke`; a package,
  a folder of the project's own components, a Tailwind 3 project (its tokens map onto theme paths), a
  missing package and one more component, all `slow`; a kit
  from code that is not React, in three shapes of project, `code-templates`, `code-sfc` and
  `code-partials` (its project carries a line that reads as an order to the agent, which nothing may
  follow), `code-update`, where one component's file changed after the kit was written, and `code-current`,
  where the change needs nothing in the kit, and `code-frame`, whose pages stand on a shared grid the kit must carry as `layout` components, with the app's page base, all `slow`). `website-kit` is tagged `browser` and cannot run
  yet, see "What a case cannot do".
- `evals/handoff/`: `/kitvas:handoff` (no destination named, a draft that does not build, a draft into a
  React project, a draft with a shared value into the same project, a draft into a Flask project with two
  files the person named, a crafted icon into the React project, the folder taken from the project's
  decisions, Figma without a Figma MCP, a draft from a kit written from the project's code, which must
  come back as the project's own components). Tagged `smoke` and `handoff`, so
  `bash evals/run.sh --tag handoff` runs these nine alone.

`/kitvas:edit` has no evals: it answers requests through the running studio, and a case cannot keep a
server alive between two commands.

A case is a folder with `prompt.md` (the user's message and the run limits) and `graders/*.md`
(`tool_used`, `regex`, `file_exists`, `llm`). A case that needs a prepared project also has `case.yaml`
and `scaffold.sh`; a scaffold may run a neighbour case's scaffold first and then add its own steps
(`craft/export` starts from `craft/pick-add`). The truth for components, props and tones is
`kits/kitvas-ui/kit.json`; graders must never reward a name that is not in it.

## Run

On Linux, from the plugin folder:

```bash
bash evals/run.sh --tag smoke
bash evals/run.sh --tag slow --ablation none
bash evals/run.sh --tag smoke --model haiku
bash evals/run.sh --cases kit/icons,craft/export --ablation none
```

`evals/run.sh` calls `claude plugin eval .` with what the cases need: `--allow-tools Bash Write Edit`
(the skills run the CLI and write files), `--scaffold` (some cases prepare their project first), Sonnet
as the model and as the judge of the `llm` graders (the judge is Haiku otherwise), three runs at a time,
and the two settings below. Options after the script's name go to `claude plugin eval`.

`--cases`, as the first option, takes case folders joined by commas: `claude plugin eval` itself filters by a
tag or by one name pattern, never by a list. The script runs them from `evals-picked/`, a copy of `evals/`
in which every other case has lost its `prompt.md` (its other files stay for a scaffold that starts from a
neighbour), and removes the copy when the run ends.

- A temp folder outside `/tmp`. `claude plugin eval` keeps each run's project folder under `$TMPDIR`,
  and its sandbox denies writes below `/tmp`. With the default the shell can write nothing, so
  `kitvas init` stops with "Read-only file system" and every case that creates `.kitvas/` fails with it.
  The script uses `~/.cache/kitvas-eval`; `KITVAS_EVAL_TMP` names another folder.
- No Windows folders on `PATH`. Under WSL they make a run fail now and then with "examining the PATH
  directories took longer than 5s".

Without `--ablation none` every case also runs without the plugin, and the table shows the difference.
Keep that for the `smoke` cases: a `slow` case without the plugin runs until its time limit.

A run starts with a warning that `evals/` overlaps the declared skills path `./`. It is expected:
`.claude-plugin/plugin.json` lists the plugin folder so that the root `SKILL.md` loads as `/kitvas`,
and `evals/results/` holds only a JSON file and an HTML file. Results go to `evals/results/`, which is
git-ignored.

Every case grants Bash, and `claude plugin eval` runs a granted shell only inside its OS sandbox. On
Windows that sandbox is not available yet (the runs are refused), so run the evals on Linux or macOS.
An Ubuntu under WSL works once `bubblewrap` and `socat` are installed; clone the repo into the Linux
home folder and run `npm ci --ignore-scripts` there, never from `/mnt/c`.

## What a case cannot do

Checked on 2026-11-25 with Claude Code 2.1.332 on Ubuntu 24.04 under WSL:

- Every Bash call is its own sandbox with no network. A server the scaffold started on `127.0.0.1` is
  out of reach, and a background process ends with the call: the studio that `studio --open` starts is
  gone by the next command. That rules out `inbox` and `request`, and with them `/kitvas:edit`.
- There is no browser. The one `kitvas browser install` fetches lives in the home folder, which the
  sandbox hides. The `a11y`, `ui`, `ux` and `runtime` checks, screenshots, `kit scan` and
  `rework new --url` do not run, and `kit verify` skips `render`, `tokens` and `look`. A grader must
  not expect them; an answer that says they were skipped is right.
- Some files cannot be read at all: the targets of the plugin's `node_modules/.bin` links (so kitvas
  runs `typescript/lib/tsc.js`, not `bin/tsc`), and `.pnp.data.json`, `.pnp.cjs`, `.pnp.js` and `.bashrc`
  in the case's home folder, the parent of the project. esbuild looks for the Yarn files above every file
  it bundles and stops at one it cannot read: `Cannot read file "…/.pnp.data.json": permission denied`.
  The shell reads `.bashrc` in every Bash call, so each command's output starts with two lines
  `.bashrc: Permission denied`; a model then adds `2>/dev/null` and no longer sees the error kitvas
  prints. Every scaffold therefore sources `evals/lib/sandbox.sh` and calls `prepare_home`, which puts
  folders with the Yarn names and an empty `.bashrc` there first: esbuild skips a folder, and a file that
  is already there stays readable. A case without a scaffold still gets the two lines.
- A scaffold runs outside the sandbox, with a 120 second limit and without `CLAUDE_PLUGIN_ROOT`. Each
  `scaffold.sh` finds the plugin folder from its own path.

## Writing a grader

- `tool_used` matches `input_match` against the tool's input as JSON text, so a quote in a command is
  written `\"` there. A model may also put the CLI in a shell variable or a function. Every pattern
  for a kitvas command therefore starts `(?:kitvas\.ts|\$\{?\w+\}?|\bK(?:ITVAS)?)\\?"?\s+`. A grader
  that expects one of a few names also takes a loop over them (`for c in Input Select; do … $c`).
  A step of a draft (`build`, `check`, `layout`, `studio`) is matched by the step and the slug after
  it, `\bbuild\s+<slug>`, so a shell function of any name still counts.
- `tool_used` counts tool calls, not commands: `build shop; check shop` in one Bash call is one call.
  Two steps that must both run get a grader each.
- What a run wrote (section code, `states.json`, `checks.json`, `kit.json`) is checked by a `regex`
  grader on the file, never by a judge. A judge with `focus: trace` is shown the first 12 and the last
  12 events of the trace, with `[…N messages elided…]` between them. A run with agents has hundreds of
  events, so a file written in the middle is not there, and the judge fails what it cannot see. The
  prompt of such a case names the draft (`Name the draft "signup".`), so the grader knows the path.
- A `regex` pattern made only of lookaheads, `(?=[\s\S]*a)(?=[\s\S]*b)`, starts with `^`. The eval
  counts every match, and without the anchor the pattern matches again at each position of the text: on
  a built bundle of 1.5 MB that took about an hour, with `^` two milliseconds.
- `tool_used` needs at least one call unless `min` says otherwise. A grader for "this must not happen"
  sets `min: 0` and `max: 0`; with `max: 0` alone it can never pass.
- A criterion names what the answer must state, never how it says it, and asks for no more than the
  skill's report rule does. A judge takes the words literally: "an empty state for a customer with no
  rentals" failed an answer that listed "Empty state: No rentals yet" with its button.
- The judge is told to be strict and answers with one word, three times; the majority decides, and the
  result keeps the votes, never a reason. It holds the answer to every word of a criterion: a detail in
  brackets ("no address was given") becomes a statement the answer must make, and "says that the scripts
  were not run" failed "I didn't run or typecheck anything". So ask for a statement only where the skill's
  report rule asks for it, and write the rest as what the answer must not say. Name what is true in a run
  and could look like a breach: "the hand-off is recorded" was read as an edit of an existing file until
  the criteria said that kitvas keeps its own record.
- A grader never holds the plugin's version or another value that a release changes: `0\.1\.0` failed
  every run from the day the version became 1.0.0.
- An `llm` grader's judge reads only the last message. The `honest-report` judge of a case that builds,
  checks or verifies starts its criteria with what an eval run can never do (no browser, so which checks
  or verify steps are skipped): that is the truth the answer is held to. With `focus: trace` the judge
  also reads the tool calls and their results, the whole of them only in a run of up to 24 events. A
  grader of such a short run that compares the answer with what the commands printed sets it and names
  that output as the truth, so the kit's facts are not copied into the criteria.
- `file_exists` counts a file the run created, and the CLI's own starting files count too: `craft new`
  writes placeholder sketches and `rework new --image` an empty inventory. To check what a file holds,
  use a `regex` grader with `target: { source: file, path: '<path from the project folder>' }`. That
  path takes no glob, and a missing file fails the grader.
