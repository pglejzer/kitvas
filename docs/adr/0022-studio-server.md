# 0022. Studio server

Date: 2026-11-22. Status: accepted.

## Context

Section 10 of the spec sets the rules for the studio's HTTP side. This records how they were built and where the build differs from the spec.

## Decision

Two `node:http` servers on 127.0.0.1, on ports the system picks unless given. The studio origin serves pages and `/api/v1/`; the prototype origin serves only built files of drafts.

A route table holds method, path, policy (`page`, `read`, `write`), zod schemas for path parameters, body and response, and the handler. OpenAPI 3.1 at `/api/v1/openapi.json` is generated from it with zod's JSON Schema output. An answer that does not match its schema is a 500.

Checks run in a fixed order: a repeated `Host`, `Origin`, `Authorization` or `Content-Length` (400), HTTP/1.1 only (400), Host (403), Fetch Metadata (403), a plain path as target (400), route (404, or 405 with `Allow`), the Origin of a write (403), the token (401), media type (415), size (413), JSON (400), fields (422). Requests node:http cannot parse get a problem response with the same headers.

Problem types are URNs named after the error code, `urn:kitvas:error:<CODE>`; the title is the HTTP status text.

Differences from the spec:

- A change without `If-Match` is 428 (RFC 6585); a stale one is 412. The spec's status list did not name 428.
- The prototype origin answers with `Cross-Origin-Resource-Policy: cross-origin`. The sandbox gives the prototype page an opaque origin, so the browser treats its own script and sheet requests as cross-origin, and `same-origin` or `same-site` would block them. A random key per start in every file path keeps other sites from loading the files, and a navigation is served only as a frame of a same-site page or when a person opens it.
- The frame address uses the host name the request came to (`127.0.0.1` or `localhost`), so both origins stay the same site and the frame's navigation passes Fetch Metadata.
- The pages are minimal: the drafts, and one draft with its latest version framed. The studio UI replaces their bodies later.

## Consequences

The token is made per start and only returned to the caller; writing it to a file for the CLI, the detached process, jobs, server-sent events and the inbox come with `kitvas studio` (plan 5b).
