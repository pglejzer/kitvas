# 0026. The studio inbox

Date: 2026-11-22. Status: accepted.

## Context

Spec section 9 asks for a way back from the studio to Claude: pages post to the server, and the CLI command `kitvas inbox` holds a GET until something arrives (section 10: `GET /api/v1/inbox?timeout=`).

## Decision

Pages post notes to `POST /api/v1/inbox` (a write: token and the studio's Origin). A note has a kind (`note` for now), the draft it is about or `null`, the element id it points at or `null`, and 1 to 4000 characters of text. Notes wait in memory, at most 100; one more is 409 `INBOX_FULL`.

`GET /api/v1/inbox?timeout=<seconds>` takes every waiting note at once. With none waiting it holds the request up to the timeout (0 to 600 s, absent is 0) and answers as soon as a note comes. One take waits at a time: a newer one ends the older one with an empty list. A caller that leaves while it waits gives its place up, so a note is never handed to a closed connection. Stopping the studio answers a waiting take with nothing.

`kitvas inbox [--timeout <seconds>]` waits 30 s by default, which fits the usual time limit of a shell call, and prints one line per note. With no studio running it says so and exits 0.

Every change of the count is an `inbox` event with `{ pending }`, so a tab can show whether Claude has read what was sent.

## Consequences

Notes live in memory: a studio that stops loses notes nobody took. A note is taken once; a `kitvas inbox` that dies between the answer and its output loses it. Both are acceptable while the inbox carries short remarks; a later stage that sends edits through it needs storage and acknowledgement.
