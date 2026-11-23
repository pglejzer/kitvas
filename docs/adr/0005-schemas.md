# 0005. Schemas as the source of truth

Date: 2026-11-22. Status: accepted.

## Context

Data crosses files, the CLI and HTTP.

## Decision

zod schemas define every data file, `--json` output and API payload; files carry `schemaVersion`.

## Consequences

Types derive from schemas. Format changes need migrations.
