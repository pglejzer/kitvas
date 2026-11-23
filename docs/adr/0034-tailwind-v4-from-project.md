# 0034. Tailwind v4 from the project

Date: 2026-11-23. Status: accepted. Adds to `0030-project-kits.md` and `0033-component-styles-in-the-bundle.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2a-project-kits-design.md`, section 5a. Evidence: `docs/spikes/07-tailwind-v4.md`.

## Context

shadcn/ui and many company systems style components with Tailwind v4 utility classes. Their CSS exists only after Tailwind has compiled the classes the code uses, and the theme is `@theme` variables in the project's stylesheet. Tailwind's programmatic API is not a documented public contract, and a compiler runs project-controlled CSS.

## Decision

- The compiler is the project's own: `tailwindcss` and `@tailwindcss/node` from its `node_modules` (never ours at runtime; kitvas has them only as pinned devDependencies for tests). A project without them is `KIT_PACKAGE_MISSING`; Tailwind v3 is `KIT_SOURCE_INVALID`, with a note that it comes later.
- A kit opts in with `runtime.styles.tailwind.entry`, the project stylesheet with `@import "tailwindcss"` and `@theme`.
- It runs in a child process (a worker script, JSON on stdin and stdout) with an argument array and no shell, 60 s, 512 MB of heap and 20 MB of output, killed on timeout. kitvas finds class candidates itself by splitting the draft's TSX and the kit's component files (capped at 2000 files and 20 MB); the spike showed the native scanner is not needed because the build ignores words that are no class.
- Classes that produce no CSS are listed in `build/json/tailwind.json`. The `ds` check adds `ds/tailwind-arbitrary` (an arbitrary value: `fix` for colours, `review` otherwise) and `ds/tailwind-unknown` (`review`).
- Theme variables are emitted only when used, so the `tokens` step of `kit verify` appends a probe rule that uses each mapped variable. With `@theme inline` the variable is not emitted at all, so the token is mapped onto the variable it points at.
- Unknown classes are found with `__unstable__loadDesignSystem(...).candidatesToCss` when it exists, else by searching for the escaped selector. The adapter sits behind a port, so another compiler path can replace it.
- Makers get `styling: 'tailwind'` and the theme variable names from `kitvas context`.

## Consequences

A Tailwind kit renders and is checked like any other, and a draft is held to the project's theme instead of arbitrary values. The cost is a child process per build of a Tailwind kit (tens of milliseconds in the spike, plus start-up) and a dependence on an API marked unstable, which a spike and a fallback selector search contain. Compiling runs the project's CSS in the project's own compiler, in a process with limits; `docs/security.md` has the row.
