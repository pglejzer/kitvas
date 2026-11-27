# 0041. Reading and copying other tools

Date: 2026-11-23. Status: accepted, changed in part by ADR 0089. Changes 0001 in part.

## Context

0001 let implementers use only the spec and public documentation. The owner widened this: other projects may be read to learn what they do, and code under the MIT licence may be copied.

## Decision

- Any agent may read other projects' code and docs for ideas.
- MIT-licensed code, such as superpowers, may be copied. A copied part keeps its copyright line and licence notice, in a header or in a third-party notices file.
- Code under other licences, or with no licence, is never copied. What is learned from it is restated as kitvas's own requirements.
- Some names must never appear in the repo, git-ignored files included. `test/guards/legacy.test.ts` searches every file and file name and keeps those names only as hashes.

## Consequences

Ideas from proven tools come in faster. Every copied MIT part needs its notice. The guard reads the whole repo on each test run (under 2 s).
