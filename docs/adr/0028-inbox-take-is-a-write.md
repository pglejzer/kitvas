# 0028. Taking notes from the inbox is a POST

Date: 2026-11-22. Status: accepted. Changes the take route of `0026-studio-inbox.md`.

## Context

ADR 0026 had `kitvas inbox` take the waiting notes with `GET /api/v1/inbox?timeout=`. A take removes the notes, so the GET changes state. ASVS 5.0 `v5.0.0-3.5.3` asks for a non-safe method for that, and in kitvas only writes get the Origin check. `docs/security.md` listed it as not covered.

## Decision

The take is `POST /api/v1/inbox/take` with the JSON body `{ "timeout": <seconds> }`: whole seconds from 0 to 600, absent is 0. It is a `write` route, so it needs the studio's Origin and the token or the page cookie, like every write. `GET /api/v1/inbox` no longer exists and answers 405 with `Allow: POST`. Everything else in 0026 stays: one waiter at a time, a caller that leaves gives its place up, a stop answers a waiting take with nothing.

## Consequences

A wrong `timeout` is now a body error (422 `BODY_INVALID`) instead of 400 `REQUEST_INVALID`. The CLI sends the studio's Origin on every call that is not a GET, so `kitvas inbox` needed only the new method, path and body.
