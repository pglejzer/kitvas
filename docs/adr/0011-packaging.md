# 0011. Dependencies in the data folder

Date: 2026-11-22. Status: accepted.

## Context

The plugin folder is replaced on every update.

## Decision

npm packages install into the plugin data folder, by a session hook and by the CLI.

## Consequences

Packages load through one loader, because ESM ignores `NODE_PATH`.
