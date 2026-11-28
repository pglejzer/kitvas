# kitvas

A Claude Code plugin: builds UI prototypes from any design system (described as a "kit"), in any project, and checks them in a local studio. Decisions: `docs/adr/`.

## Commands

```bash
npm ci --ignore-scripts                       # install
npm run check                                 # the full gate: lint, types, tests with coverage, audit
npm test                                      # all tests
node --test test/shared/config.test.ts        # one test file
npm run format                                # fix formatting
npm run types                                 # type check only
node bin/kitvas.ts status --json              # run the CLI from the repo
claude plugin validate . --strict             # validate the plugin
claude plugin eval . --allow-tools Bash Write Edit --tag smoke   # skill evals (evals/README.md)
```

## Rules

- This is a new project. MIT-licensed code (such as superpowers) may be copied; keep its copyright and licence notice with the copied part. Other tools' code may be read for ideas, never copied.
- TypeScript runs directly in Node: erasable syntax only, relative imports end in `.ts`, `import type` for types.
- Never the `any` type, in any form: not in code, tests, `.d.ts` files, generated code strings or samples, and no comment that switches the check off. Use `unknown` and narrow it, or an exact type. Biome and `test/guards/no-any.test.ts` enforce it.
- Third-party packages load only through `src/shared/deps/deps.ts`. Never `import 'zod'` at runtime elsewhere.
- Modules talk through their `index.ts`. Only `src/main.ts` imports adapters. `test/guards/architecture.test.ts` enforces it.
- Code files have at most 500 lines, test files at most 800. Keep code in folders by responsibility, never one catch-all folder: a folder holds at most 20 code files directly; before the 21st, split it into subfolders named for what their files do (tests mirror their source). `test/guards/file-size.test.ts` enforces all three.
- KISS, DRY, YAGNI. Before you add a helper, a value or a mechanism, search for the one the repo has and use it. Build only what the task asks for. A change removes, in the same task, the code, texts (`locales/en.json` keys), styles and tests it makes unneeded: no second copy, no compatibility layer, no cleanup left for later.
- Text for people comes from `locales/en.json` through `t()`. English only.
- Every CLI command supports `--json`: `{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`.
- New dependency: exact version, at least 14 days old unless it fixes a vulnerability, `npm audit` clean.
- An ADR records a decision, not a feature: write one only when it names an alternative that was turned down, or the earlier ADR it changes. Changing a decision in `docs/adr/` needs a new ADR, not an edit: in the older ADR only the status changes (`replaced by ADR NNNN` or `accepted, changed in part by ADR NNNN`). `npm run adr` writes the index `docs/adr/README.md`; a guard test fails when it is stale.
- Do not repeat in this file what the code already shows.

## Where things are

- Error codes and exit codes: `src/shared/errors/errors.ts`.
- Paths and the data folder: `src/shared/env/paths.ts`.
- Adding a command: a file in the folder of what it acts on under `src/cli/commands/` (`draft`, `kit`, `handoff`, `studio`, `project`), exported from `src/cli/index.ts`, listed in `src/main.ts`, messages in `locales/en.json`.
- Kits (contract, tokens, loading): `src/kit/`, rules in `src/kit/AGENTS.md`. Themes (`tokens.themes`, a token file each, `attributes` on the body, the option `theme`) and the project's tokens and theme values (`.kitvas/additions/<kit>/tokens.json`, `tokens.<theme>.json`, marked "Added by this project"): ADR 0083; what a skill asks before it adds one: `skills/compose/`.
- The built-in kit (the studio's look as a kit, the default of a project: `DEFAULT_KIT` in `src/shared/settings/decisions.ts`): `kits/kitvas-ui/`, rules in `kits/kitvas-ui/AGENTS.md`; its token files, locals sheet and icon paths are written by `npm run kit-ui-tokens` (`scripts/kitvas-ui-tokens.ts`) from `src/studio/theme/tokens.ts`. ADR 0090.
- The project's decisions file (`.kitvas/decisions.md`: front matter `kit`, `copy`, `check`, then dated decisions; `kitvas decisions [add | set | replace]`; `loadSettings` reads it): `src/shared/settings/{decisions,project-file,config}.ts`, `src/cli/commands/project/decisions.ts`, the doctor's `decisions` check. ADR 0076.
- Project kits (`.kitvas/kits/<id>/`, sources `npm` and `repo`, `kit new | verify | use | exports | merge`): `src/kit/`; verified by `src/checks/app/verify-kit.ts`; learned by `/kitvas:learn` (`skills/learn/`, `agents/learner.md`, `reference/learn.md`, the contract as a file in `reference/kit.schema.json`). ADRs 0030 to 0034, 0081.
- How a project's own code finds its files and types (its tsconfig.json with what it extends and references, and `resolve` of kit.json; one record for esbuild, Sass and tsc): `src/shared/project/`, the learner's rules L35b to L36a in `reference/learn.md`. ADR 0092. Its public env variables in every bundle (`readPublicEnv`): ADR 0095.
- Written kits (sources `figma`, `web`, `images`, `code`; components in `<kit>/components/`): written by `agents/tailor.md` under `reference/write-kit.md`. A `code` kit is written from a project's files under `reference/write-kit-code.md`, keeps each example's original in `<kit>/originals/`, and has the verify step `original` (`src/checks/app/verify/original.ts`, `src/checks/domain/kit/original-page.ts`, `src/checks/domain/kit/original-compare.ts`, styles compiled by `src/render/app/project-styles.ts`); `src/kit/app/origins.ts` records where each component came from and names the ones whose files changed. `kit scan` (`src/checks/app/scan-kit.ts`) reads a website, `kit crop` (`src/checks/app/crop-kit.ts`) cuts references, and the sixth verify step `look` scores each example against its reference. Figma is read only by the skill through the person's own MCP. ADRs 0035 to 0039 and 0093.
- Shared values of a version (`v<N>/src/json/shared.json`: what a person chose on the page, set by one section's control and read by others as the props `shared` and `setShared`): `src/shared/values/shared-values.ts`, `src/drafts/{domain,app}/shared-values.ts`, the mount's `Held` in `src/render/domain/mount.ts`, the frame's `client/frame/page/shared-values.ts`, the rule `ux/shared-unused` in `src/checks/domain/shared-values/`. ADR 0086.
- Controls in a check (every control under a real pointer and with focus, and used once): `src/checks/adapters/facts/playwright-{states,press}.ts`, the rules `a11y/state-contrast` (`src/checks/domain/rules/a11y-states.ts`) and `ux/dead-control`; the rules for makers in `reference/controls.md`, the research in `docs/research/control-states.md`. ADR 0085.
- Options of a version (`v<N>/src/json/options.json`; a value is a condition in one source, `data-opt-<id>` on the page's root): `src/shared/values/options.ts`, `src/drafts/{domain,app}/options.ts`, the frame's `client/frame/page/{options,show}.ts`; in the studio the pill and the row `src/studio/pages/draft/options-row.ts`, the page's one choice `client/studio/options/`, "Make default" `src/studio/api/edit/options-routes.ts`. ADR 0082.
- Rework and craft (`/kitvas:rework`, `/kitvas:craft`, `agents/sketcher.md`, `reference/craft.md`): draft kinds, `before/`, additions layer, `kit detect`. ADRs 0045 to 0047.
- Doctor (`kitvas doctor`, the report with nothing private): `src/doctor/`, `src/cli/commands/project/doctor.ts`. ADR 0063.
- Web research (`kitvas:scout`, `agents/scout.md`, rules in `reference/scout.md`): one agent with `WebSearch` and `WebFetch` that writes `<draft>/v<N>/md/research.md`; called by the compose and craft skills. ADR 0062.
- Hand-off (`/kitvas:handoff figma | code`, `kitvas handoff …`): `src/handoff/` (Figma: layers, tree, variables, scripts, package; code: target, brief, changes, compare; the record), the builder that runs inside Figma in `client/figma/`, the layer walk `src/checks/app/measure-layers.ts`, `skills/handoff/`, `agents/fitter.md`, `reference/handoff-{figma,code}.md`. ADRs 0078 and 0079.
- The editor's write-back (operations, TSX and SCSS apply, style source, off-kit values): `src/edit/`, rules in `src/edit/AGENTS.md`; its panels are `client/studio/edit/`. ADRs 0048 to 0050; a shorthand (`padding`, `border`, `background`) read as a source and written in place: ADR 0070; one list item's own class ("This item"): ADR 0072.
- The editor's structure (move, insert, delete, wrap, sections, element ids across edits, drag, handles, zoom): `src/edit/`, `src/drafts/` (layout edits, rename log), frame tools in `client/frame/`, panels in `client/studio/edit/`. ADRs 0051 to 0053; press and drag, list item drag, the rectangle and the handles' magnet: ADR 0059; a click takes the list row (`client/frame/edit/row-pick.ts`): ADR 0069.
- The Insert pane's kit previews (`kitvas kit previews`, the icon sheet, the palette's `previews`): `src/checks/app/kit-previews.ts`, `src/render/domain/icon-sheet.ts`, `src/studio/previews/`; the pane is `client/studio/edit/insert/`; the kit page's Icons card draws from the same sheet (`src/studio/views/kit-icons.ts`, `src/studio/pages/kit/kit-icons.ts`). ADR 0075.
- The editor with Claude (requests and the listening session, variants, notes, locks, timeline, suggestions, why): `src/studio/requests/`, `skills/edit/`, `src/edit/app/{locks,suggest,history}/`, `client/studio/edit/{ai,notes,view,timeline,why}/`, and `why/<Section>.json` beside a version's `src/` (`src/drafts/app/why.ts`). ADR 0056.
- Tools on the canvas (lenses and their pins, the ask bar, the action bar, the variant pill, the Claude tab's control): `client/studio/lens/`, `client/frame/lens/`, `client/studio/edit/{ask,seltools}/`, `client/studio/edit/ai/control.ts`, the Kit lens route `src/edit/app/kit-lens/`; "Custom…" in `client/studio/edit/props/custom/`. ADR 0077.
- Drafts (versions, layout, section context): `src/drafts/`, rules in `src/drafts/AGENTS.md`.
- Deleting a draft (`kitvas draft delete | restore | purge`, the trash in `.kitvas/trash/`): `src/drafts/app/trash.ts`, `src/studio/api/trash/`, `client/studio/trash/`. ADR 0064.
- Building a draft (bundle, styles, element ids): `src/render/`, rules in `src/render/AGENTS.md`. Code bundled into prototypes lives in the top-level `client/` folder.
- Checks of a draft (findings, rules, `checks.json`): `src/checks/`, rules in `src/checks/AGENTS.md`.
- The local studio (servers, API routes, security checks, pages): `src/studio/`, rules in `src/studio/AGENTS.md`.
- The start page, the logo, Claude's status in every bar and the Guide, Shortcuts and Doctor pages: `src/studio/pages/{start,brand,info}/`, `client/studio/{start,info,shell}/`, rules in `src/studio/AGENTS.md`. ADRs 0068 and 0084.
- The studio's look (tokens, light and dark, Cards and Flush, accents, skin, icons, the frame's tones): `src/studio/theme/`, `src/studio/pages/skin/`, `src/studio/pages/icons/`, `client/frame/tones/`, rules in `src/studio/AGENTS.md`; the rules against the generic look for agents: `reference/anti-slop.md`. ADR 0057.
