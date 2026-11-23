# 0021. Browser checks

Date: 2026-11-22. Status: accepted.

## Context

`a11y`, `runtime` and the props a kit component really gets can only be seen on the rendered page. Spike 04 measured about 0.7 s per state and width. Spike 05 showed that the browser ends with the process that started it.

## Decision

playwright-core 1.65.0 and axe-core 4.14.0 are runtime dependencies. The browser is system Chrome, else Edge, else a Chromium that `kitvas browser install` downloads into `<data folder>/browsers`. The spec said Chromium is downloaded on first use; kitvas asks the person to run the install instead, because it is a large download from the network.

There is one browser per `kitvas check` and one context per visit, closed in `finally`. Reusing one browser across runs comes with the studio.

Each state is opened at 390 × 844 and 1280 × 900 from disk with `?state=<id>`. Console messages are collected until axe is injected. axe runs the WCAG 2.0 to 2.2 A and AA rules with `preload: false`, because a page opened from disk cannot fetch its own sheets and axe then reports errors that are not the draft's. Chrome's `Failed to load resource` line is dropped since the failed request is its own finding.

The JSX dev runtime records which kit component each draft element rendered and with which plain props. The ds rules compare them with the catalog.

| Rule | Severity | Found when |
| --- | --- | --- |
| `a11y/<axe rule>` | fix for critical and serious, else review | axe reports a violation; the element is the nearest `data-ks` |
| `runtime/blank` | fix | a state renders nothing |
| `runtime/page-error` | fix | an uncaught error, or the page did not load |
| `runtime/console-error` | fix | the browser console shows an error |
| `runtime/console-warning` | review | the browser console shows a warning |
| `runtime/request-failed` | fix | a file the page asks for does not load |
| `ds/not-in-catalog` | fix | a kit export that is not a catalog component is rendered |
| `ds/unknown-prop` | fix | a prop the catalog does not list, outside `styling`, `aria-*`, `data-*`, `id` |
| `ds/bad-value` | fix | an enum prop gets a value the catalog does not list |
| `ds/missing-prop` | fix | a required prop is not given |

## Consequences

A machine without Chrome or Edge still gets the file checks, and a note says how to get the browser ones. A check of one state at two widths takes about 2 s on top of the build. Elements rendered in a loop share an id, so their findings merge. Props that are not plain values (functions, objects) are recorded as given, without their value.
