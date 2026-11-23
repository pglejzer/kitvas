# 0004. Modular monolith with ports and adapters

Date: 2026-11-22. Status: accepted.

## Context

The plugin has several areas that will grow at different speeds.

## Decision

One package; modules with domain, app, ports, adapters and an `index.ts`; only `main.ts` wires adapters.

## Consequences

A test enforces boundaries. More folders than a flat layout.
