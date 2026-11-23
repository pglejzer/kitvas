# 0003. TypeScript run directly by Node

Date: 2026-11-22. Status: accepted.

## Context

A build step would complicate a plugin loaded from a folder.

## Decision

Source is TypeScript with erasable syntax, run by Node's type stripping. Node `^24.22.3 || >=26.13.1`.

## Consequences

No enums or namespaces. `tsc` only checks types.
