# 0024. Studio events and jobs

Date: 2026-11-22. Status: accepted.

## Context

Spec section 10 asks for live updates from the studio to its tabs, long operations as job resources that can be cancelled, one build per draft, limits on build time, memory and output, pruned jobs and a cap on event streams.

## Decision

Events: `GET /api/v1/events` is a Server-Sent Events stream. Each event has a number, a type (`job`, or `reset`) and JSON data. The studio keeps the last 200. A tab that reconnects sends `Last-Event-ID` and gets what it missed, or a `reset` event when those events are gone or the number comes from an earlier studio; after a reset the tab reloads what it shows. A comment line every 15 s keeps idle connections open. At most 16 streams are open; one more gets 503 with `Retry-After`. The stream needs the token like any read. `EventSource` cannot send an `Authorization` header, so the studio pages read the stream with `fetch` and parse it themselves, which keeps the token out of the URL.

Jobs: `POST /api/v1/drafts/{slug}/builds` starts `kitvas build <slug> --json` as a child process in the project and answers 202 with the job and its `Location`. A job is `running`, then `succeeded` (with the command's data), `failed` (with its error) or `cancelled`; every change is a `job` event. A second build of the same draft while one runs is 409. `POST /api/v1/jobs/{id}/cancel` ends the process. Each job runs with `--max-old-space-size=2048`, a 120 s time limit and a 1 MiB output limit over stdout and stderr; going over ends it as `failed` with `JOB_LIMIT`. A process that ends without an answer is `JOB_CRASHED`, and its stderr goes to the studio's log, never into the API. The studio keeps the 50 latest finished jobs. Stopping the studio cancels running jobs, then ends the streams.

Starting and cancelling a job change no resource that has an ETag, so they need the studio's Origin and the token but no `If-Match`. A job's process gets the studio process's environment, which never holds the token.

## Consequences

Checks become jobs the same way once the studio shares one browser with them (plan 5d). Jobs live in memory: a restarted studio forgets them, which is fine because the build output on disk is the result.
