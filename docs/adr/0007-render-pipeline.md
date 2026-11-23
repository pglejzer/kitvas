# 0007. Render pipeline

Date: 2026-11-22. Status: accepted.

## Context

Design systems style in different ways.

## Decision

esbuild plus a `StylePipeline` port; one measurement service yields a render tree.

## Consequences

Stage 1 has one pipeline (Sass). Others are adapters.
