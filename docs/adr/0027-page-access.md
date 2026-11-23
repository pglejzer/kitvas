# 0027. Pages open only from a one-time link

Date: 2026-11-22. Status: accepted (owner decision after `docs/security.md`).

## Context

The studio's pages answered anyone who sent a plain request with the right Host. Plan 6 gives the pages live data and API calls, so whatever a page carries would reach any program on the machine, another user's included. The spec first put the session token in the pages; the threat model showed that would hand the token out.

## Decision

Each studio start makes a page secret, apart from the token. A browser gets it only as a cookie, `kitvas_<port>`, with `HttpOnly`, `SameSite=Strict` and `Path=/`, from `GET /open?code=&to=`. The code comes from `POST /api/v1/links`, which `kitvas studio` calls with the token; it works once, for 60 s, and the studio keeps only its sha256. `/open` sets the cookie and answers 303 to the page in `to` (the drafts or one draft, else the drafts). Pages without the cookie get a short locked page, status 401, naming no draft. API routes take the cookie as well as the token; writes still need the studio's Origin.

The name carries the port because cookies ignore ports: two studios on one machine keep their own cookies. The prototype origin, on another port of the same host, also receives the cookie; it cannot read it (`HttpOnly`, and the sandbox gives the prototype an opaque origin), and its requests to the studio fail Fetch Metadata and the Origin check.

## Consequences

The token never appears in a page, a URL or HTML. The link the CLI prints is a secret for one minute and once only. Any other web server on 127.0.0.1 that the user opens in the same browser receives the cookie too; such a server is a program running on the machine, which the threat model leaves out when it runs as the same user. A bookmark of a studio page shows the locked page after the studio restarts.
