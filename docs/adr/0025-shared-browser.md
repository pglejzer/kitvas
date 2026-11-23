# 0025. One shared browser for check jobs

Date: 2026-11-22. Status: accepted.

## Context

Spec section 8 asks for one browser started with `launchServer` and reused while the studio runs, with one context per check. Each `kitvas check` used to start and close its own browser, which costs a second or more per check.

## Decision

The studio starts a browser at the first check job, through the `BrowserHost` port: Playwright's `launchServer` on host `127.0.0.1`, set explicitly, with Playwright's random WebSocket path. Check jobs get its endpoint and name in `KITVAS_BROWSER_WS` and `KITVAS_BROWSER_NAME`; `src/main.ts` reads them and the check command connects instead of starting a browser. A connected session only disconnects when it closes, so the browser keeps running for the next check. When the endpoint does not answer, the check starts its own browser as before. A browser that went away is started again at the next check. The studio closes the browser when it stops.

The endpoint is a secret: whoever has it can drive the browser. It goes only into the environment of the studio's own check processes, never into a log, the state file, the API or command output. The browser's pid goes into the state file, so `kitvas studio stop` ends a browser that is still running after its studio was ended.

Builds and checks of one draft exclude each other: one job per draft at a time, whatever its kind.

## Consequences

`kitvas check` run in a terminal still starts its own browser. Spike 05 is repeated with the detached studio and its shared browser, and its result is recorded in `docs/spikes/05-browser-cleanup.md`.
