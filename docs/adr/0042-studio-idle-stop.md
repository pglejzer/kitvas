# 0042. The studio stops when nobody uses it

Date: 2026-11-23. Status: accepted (owner decision, plan 10). Adds to ADR 0022 and ADR 0040; those files stay as they are.

## Context

`kitvas studio` starts a detached server per project, and nothing stopped it but `kitvas studio stop`, a signal or a reboot. People forget it: a studio started for one afternoon kept its two ports, its process and, while a check ran, a browser, for days. Since ADR 0040 the address and the cookie survive a restart, so a stopped studio costs one `kitvas studio` and nothing else. An open tab, though, only went quiet when its studio was gone, with no word why.

## Decision

1. **Setting.** `studioIdleMinutes` in the user's `<home>/.kitvas/config.json`: an integer from 0 to 10080 (one week), default 240. 0 never stops. `kitvas studio serve` reads it once at its start; a change applies from the next start.
2. **Use.** A request to the studio origin is use from the moment it comes until its answer ends, refused ones included, so a long inbox take holds the stop off while it waits. The events stream is not use: a tab opens it by itself and opens it again after each drop, so counting it would keep a forgotten tab's studio up forever; its heartbeats are no requests at all. A running job is use for as long as it runs, and its end is use too, so the wait counts from the end of the last job. The prototype origin does not count: its frames load only inside pages that were requested from the studio origin.
3. **Stop.** When the time since the last use reaches the limit and no job runs, the studio stops the same way as `POST /api/v1/shutdown`: the state file goes, the shared browser ends, then the streams and both servers close. The log gets one line, `studio.log.idle` with the minutes; it never holds the token or the page secret. One timer runs at a time: use only moves the time the next check reads. The clock and the timer are injected, so tests wait for nothing.
4. **Paused view.** Every page behind the cookie carries a hidden paused view with `studio.paused.title` and `studio.paused.body` from the locale. The page script watches its events stream: when the stream was lost (a stream that was open ended, or the studio did not answer) and 15 s pass without it opening again, the view takes the page's place, with `role="status"`, and gets the focus. A refused request (401, 503) does not start the 15 s, because the studio answered. When the stream opens again, the page reloads. The kit page keeps its stream open after its catalog job ends, so it shows the view too. The view is styled from Base tokens only.

## Consequences

- A studio started and forgotten is gone after four hours by default; the next `kitvas studio` starts it on the same address, and an open tab reloads within 30 s of that.
- A tab left open does not keep a studio running, but any click in it before the limit does, because each page load is a request.
- `kitvas inbox` calls the studio, so an agent that waits for notes keeps it up.
- `kitvas status --json` shows `studioIdleMinutes` with the other settings.
- The kit list page has no script, so it does not show the paused view.
