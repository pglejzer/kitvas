# 0089. No guard searches the repo for forbidden names

Date: 2026-11-27. Status: accepted. Changes in part `0041-reading-and-copying-other-tools.md`.

## Context

ADR 0041 kept some names out of the repo with `test/guards/legacy.test.ts`, which read every file and file name, git-ignored ones too, on each test run. It guarded against leftovers from tools that kitvas was modelled on. By now the code has been rewritten so far that nothing in it follows such a tool closely, and the guard catches no real risk.

## Decision

- The forbidden-name guard is removed. The rules of ADR 0041 on reading and copying other tools stay as they are.
- The second test of that file, that file names are plain ASCII and code has no Polish text, moves to `test/guards/english.test.ts` unchanged.

## Turned down

- **Keep the guard.** It reads the whole repo, git-ignored files included, on every test run to look for something that is no longer there to leak.

## Consequences

The test run skips one walk over the whole repo. Nothing checks the names automatically any more.
