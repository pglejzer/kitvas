# 0017. API and security rules

Date: 2026-11-22. Status: accepted.

## Context

A local server is reachable from any page in the user's browser.

## Decision

Resource routes, problem details, ETags; loopback only, Host and Origin checks, Fetch Metadata, a session token, strict headers, files from a map.

## Consequences

A security test suite is part of the gate.
