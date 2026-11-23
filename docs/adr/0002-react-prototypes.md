# 0002. Prototypes are React only

Date: 2026-11-22. Status: accepted.

## Context

Most large design systems ship React components.

## Decision

Prototypes are TSX. The kit contract and core do not depend on a framework.

## Consequences

Other frameworks need a new renderer, not a new core.
