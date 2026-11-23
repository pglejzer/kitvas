# 0015. One quality gate

Date: 2026-11-22. Status: accepted.

## Context

Rules that are not checked decay.

## Decision

`npm run check` runs lint, types, tests with coverage, audit and the guards.

## Consequences

CI runs it on Windows, Linux and macOS, on both Node lines.
