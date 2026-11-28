# 0032. Packages and React from the project

Date: 2026-11-23. Status: accepted, changed in part by ADR 0092. Adds to `0030-project-kits.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2a-project-kits-design.md`, section 4. Evidence: `docs/spikes/08-react-from-project.md`.

## Context

A design system's components use React hooks and context, so the design system, kitvas's runtime and the prototype must share one copy of React. kitvas has its own React for the Base kit, and the project has another. The design system's own versions, peers and types sit in the project's `node_modules`, not in the plugin's.

## Decision

- A project kit resolves every package from the project's `node_modules`: the design system, its peers, React and React DOM. The build's working folder is the project.
- The `react` and `react-dom` aliases point at the project's copies when the project has them, else at kitvas's own (Base, or a project without React). The JSX dev runtime and the frame runtime import React through the same alias.
- The spike bundled a fake package with context and state against React 18.3.1: one copy of React in the bundle, hooks working across package and entry, kitvas's dev runtime and frame runtime working on React 18 (they use only `Fragment`, `jsxDEV`, `createRoot` and `flushSync`).
- A project below React 18 is refused (`kitIssue.reactTooOld`). The `types` check takes `@types/react` from the project when it has it, and the `paths` of the project's `tsconfig.json` (`@/*` in shadcn projects).
- This changes one line of `0020-checks-and-findings.md` for project kits: tsc errors outside the draft's `src/` are dropped from the draft's findings instead of being `review`, because they sit in the design system's or the project's own files, compiled with stricter settings than the project's, and `kit verify` checks the kit. Built-in kits keep 0020's rule.
- A missing package is `KIT_PACKAGE_MISSING`. Nothing is installed.
- Design-system and theme code never runs in Node: it is bundled in Node and runs in the browser (checks, studio sandbox) only.

## Consequences

A prototype uses the React the person's app uses, so a React 18 project works and versions never mix. kitvas's runtime code is limited to APIs present in React 18 and 19. A project with no `node_modules` has no kit to learn; the person installs first.
