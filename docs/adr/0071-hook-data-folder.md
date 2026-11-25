# 0071. The session hook reads its data folder from its environment

Date: 2026-11-25. Status: accepted. Adds to ADR 0011 (how the hook learns the data folder).

## Context

The session hook ran `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-deps.ts --data ${CLAUDE_PLUGIN_DATA}`. Anthropic's plugin directory checks every hook command before a listing: "In the command of a hook or an MCP server, write each path in full from `${CLAUDE_PLUGIN_ROOT}`, with no other variable, command substitution, wildcard, or inline program". Another variable blocks the submission. Claude Code exports both `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` to every hook process, so the script can read the folder there. A shell can also hold that pair from another plugin, which is why the CLI never reads `CLAUDE_PLUGIN_DATA` (`src/shared/deps/deps.ts`).

## Decision

- The hook's command names one variable, `${CLAUDE_PLUGIN_ROOT}`: `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure-deps.ts`.
- The script takes `CLAUDE_PLUGIN_DATA` from its environment only when `CLAUDE_PLUGIN_ROOT` in the same environment is its own folder, compared after links and letter case are settled (`hookDataDir` in `src/shared/env/paths.ts`). Otherwise the folder comes as before: `KITVAS_DATA_DIR`, the pointer, the default.
- `--data <folder>` stays for a run by hand and wins over the environment.
- The CLI is unchanged: it still never reads `CLAUDE_PLUGIN_DATA`.

## Turned down

- **Keeping `--data ${CLAUDE_PLUGIN_DATA}` in the command.** The directory blocks it.
- **No hook, with the packages from Claude Code's own install.** Claude Code's docs say it installs a marketplace plugin's npm packages from its `package.json` and lockfile when it copies the plugin into its cache. On 2026-11-25 Claude Code 2.1.332 installed kitvas from `pglejzer/kitvas` on GitHub into its cache with no `node_modules`, and from a marketplace in a local folder it installed none either. Without the hook the first command would install them itself, so the install's wait (9 seconds on a fast line in that test, more on a slow one) would fall into a person's first request.
- **Reading `CLAUDE_PLUGIN_DATA` alone.** A leftover variable of another plugin would make kitvas install its packages into that plugin's folder.

## Consequences

The plugin directory still holds the hook for a reviewer, for reasons this ADR does not change: it runs a TypeScript file, not a shell script, and that file runs `npm ci`. When Claude Code does install the packages itself, `depsAreFresh` sees `node_modules` in the plugin folder and the hook only writes the pointer.
