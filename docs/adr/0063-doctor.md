# 0063. Doctor

Date: 2026-11-24. Status: accepted. Builds on ADR 0023 and ADR 0040.

## Context

`kitvas status` prints the version, Node, the language, the kit and whether a workspace exists. `kitvas browser` says which browser the checks use. Nothing answers in one place why kitvas does not work on a machine, and nothing gives a report a person can paste into an issue. On the owner's machine 14 edits failed with Windows `EPERM` on a file move in the drafts folder, and the editor showed nothing. A trial write would have named it at once.

## Decision

- **`kitvas doctor [--report] [--json]`** runs nine checks, each with an id, a state (`ok`, `warn`, `fail`, `skipped`), one sentence of what it found and, unless `ok`, one line of what to do: `node`, `deps`, `plugin`, `workspace`, `kit`, `browser`, `data`, `ports`, `studio`. Each reuses the rule the code already has (`isSupportedNode`, `resolveDep`, `loadSettings`, `loadKit` and `kit detect`, the browser open of `kitvas browser`, the studio's state file); none has a second copy of a rule.
- **It changes nothing that lasts.** The write probe makes a file and a temporary file beside it in the data folder and the drafts folder, moves the temporary over the file as the draft store does, and removes both, also when a step fails. A folder that does not exist yet is probed through the nearest folder above it and is not created. The studio's state file is read, never cleaned up.
- **A move that works only after a retry is a `warn`**: another program (a virus scanner, a sync client) holds files there for a moment. One that never works is a `fail` with the system code.
- **A check that throws is a `fail` of that check** with the error's code; the others still run. The ports check keeps a name that does not resolve here a `warn`: browsers resolve `*.localhost` themselves (ADR 0040), and the fallback link is on `localhost`.
- **The studio's log gives codes and counts only.** The error lines of the last 24 hours are counted per error code; no path, draft or message is kept.
- **Exit code.** 0 when no check fails (warnings too), else the code of `DOCTOR_FAILED`. The answer is printed in both cases, so `--json` is one `{"ok":true,"data":{"checks":[…]}}` on stdout, and the exit code carries the verdict (`Command.failure` in `src/cli/registry.ts`).
- **`--report` prints one block of plain text** (kitvas version, system, Node, one line per check) that goes through one pure function, `redact`, before it leaves. The home folder is written `~` and the project folder `<project>`. Never in it: the user name, a draft slug or title, file content, an environment value, an e-mail address, a token, or an address beyond `127.0.0.1` and `kitvas.localhost`. `--json` carries the same checks, and the report text under `report`.
- **A module of its own, `src/doctor/`.** The checks touch the machine, so they sit behind one port (`Machine`) with a Node adapter that only `src/main.ts` wires; the rules are tested with an in-memory fake. The command that gathers the project's facts (kit, browser, studio) is in `src/cli/commands/doctor.ts`.

## Consequences

A person, or Claude through the readiness skill, gets one answer for a setup that does not work, and a text that is safe to post. It is a command of its own beside `status`: `status` stays a cheap read that never opens a browser or a port, while the doctor probes and takes a few seconds. The cost is a small port and adapter, and a second place that knows the draft store's retry waits (the move in `src/doctor/adapters/node-machine.ts`), so its verdict matches what the editor would meet.
