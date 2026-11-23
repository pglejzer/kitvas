# 0006. Kit contract

Date: 2026-11-22. Status: accepted.

## Context

Design systems differ in imports, providers, styling and tokens.

## Decision

A source-independent `kit.json` plus DTCG 2025.10 tokens and a `--kit-*` alias layer.

## Consequences

Each source is an adapter. Unknown data is listed as a gap, never guessed.
