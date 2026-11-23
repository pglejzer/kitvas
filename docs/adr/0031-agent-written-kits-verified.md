# 0031. Agent-written kits, verified by kitvas

Date: 2026-11-23. Status: accepted. Adds to `0030-project-kits.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2a-project-kits-design.md`, sections 6 and 7.

## Context

A project kit has to describe a design system the plugin has never seen: components, props, enum values, tokens, examples. Reading a package's types and a folder of components is judgement work; an extractor on the TypeScript API would tie the plugin to an API that TypeScript 7 exposes only as `unstable`. But an agent that writes `kit.json` can invent a prop or a value, and a kit with a wrong prop breaks every draft that uses it.

## Decision

- **An agent writes, kitvas verifies.** The `/kitvas:learn` skill runs `kit new`, then the `learner` agent (Sonnet, no shell, writes only inside `.kitvas/kits/<id>/`, never `generated/`) fills `kit.json`, the tokens and `css-var-map.json` from the package's types and docs or the components folder. The agent never invents a prop or value it did not read.
- **Five deterministic steps**, `kitvas kit verify [id]`: `schema` (the contract and the stage 1 rules, plus the disk checks), `imports` (a bundle of the generated entry resolves every export), `types` (a generated file with one JSX use per enum value and one with the required props, and every example, compiled with the real types; errors mapped back to component, prop and value), `render` (the catalog build, then every example opened in the browser: shown, no console error, no page error, no failed request) and `tokens` (each mapped variable's value in the browser equals the token's value; colours compared as sRGB, dimensions in px).
- **Without a browser** `render` and `tokens` are `skipped` with a note. The answer is `valid: false` when a step failed, with exit code 0, like `kit check`.
- **The stamp.** `verify.json` in the kit's catalog folder holds the steps, the issues as message keys, the kit's hash and the time. A different hash makes it `stale`; the studio shows passed, failed, stale or never.
- **Findings go back** to the learner, at most two rounds; what is left is reported to the person.

## Consequences

The agent can be wrong and the kit still cannot lie: what `kit verify` passes has compiled and rendered. A prop the types do not accept is found before a draft uses it. The cost is a browser and a TypeScript run per verify; both are skipped or reported when unavailable. A token that cannot be read becomes a `gaps` entry (`unverified`). `render` and `tokens` problems are reported but do not block drafts; `schema`, `imports` and `types` do.
