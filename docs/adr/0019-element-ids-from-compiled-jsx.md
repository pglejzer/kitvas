# 0019. Element ids from compiled JSX

Date: 2026-11-22. Status: accepted.

## Context

The studio and the checks must address an element of a prototype without class names, and the id must survive unrelated edits. Spike 01 showed that an own JSX dev runtime can mark elements, and decided that ids must not contain line numbers.

## Decision

Ids are computed at build time. Each draft `.tsx` file is compiled alone by esbuild with `jsxDev`. The opening `jsxDEV(` calls are in source order and the source objects close in post-order, which gives every element's parent. The id is the file plus the tag path, with `.2`, `.3` for later same-tag siblings; fragments are skipped. The map from source position to id is compiled into the bundle and the JSX dev runtime adds `data-ks`. A component element gets the id as a prop and puts it on its root when it forwards its rest props.

## Consequences

No TSX parser and no new dependency. Draft code never runs in Node, and `ids.json` is complete for every state. The scan depends on how esbuild prints dev JSX calls, so a mismatch is detected and reported as a warning. Elements rendered in a loop share an id. Looking up the usage site of a component that forwards nothing through React's tree (the second half of spike 01) is postponed until a kit needs it.
