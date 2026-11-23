# 0039. No `any` from library types

Date: 2026-11-23. Status: accepted. Spec: `docs/specs/2026-11-23-kitvas-stage-2b-written-kits-design.md`, section 11.

## Context

The owner's rule is that the `any` type appears nowhere in kitvas, in any form. Two standard library signatures bring it in without anyone writing it: `JSON.parse` returns `any`, and `Array.isArray` narrows to `any[]`. Biome and the guard test see only written `any`, so these slipped through.

## Decision

- A declaration file, `src/shared/types/strict-lib.d.ts`, makes `JSON.parse` return `unknown` and `Array.isArray` narrow to `unknown[]` for all of kitvas's code.
- The code narrows the result with zod or a guard. Tests use `JSON.parse(text) as <exact type>`.
- The guard test checks that the file stays part of the type check, so removing it fails the gate.

## Consequences

An unchecked value cannot flow out of a parse and into the code as `any`. The cost was a few dozen lines in tests that needed an exact type. A new library signature that returns `any` is handled the same way: a declaration in this file, not a cast or a comment that switches the check off.
