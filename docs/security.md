# Security model

The kitvas studio is a local HTTP server that shows UI prototypes in the user's browser and runs build and check jobs for the CLI. It listens on 127.0.0.1 on two ports: one for pages and the JSON API, one for the prototypes. This is a STRIDE model of that server, with the OWASP ASVS 5.0.0 requirements each control maps to, written `v5.0.0-<id>`. The rows say what the code does today; where an id fits only partly, the row says so.

## Assets

- The session token: 32 random bytes per start, kept in the state file `<data>/studio/<key>.json`, used by the CLI.
- The page secret: 32 random bytes per project, kept in `<data>/studio/<key>.secret` (mode 0600, written by `run/secret-file.ts`), held by the browser in the `kitvas_<port>` cookie for 30 days after a one-time link. Deleting the file resets every browser.
- The user's drafts and project files.
- The shared browser's Playwright endpoint: whoever has it can drive the browser.
- The state file itself (pid, ports, token).
- The studio's own pages and API, which must only act for the user.

## Who attacks

- A web page on another origin in the user's browser: CSRF, DNS rebinding, cross-site reads, framing.
- A malicious prototype running inside the studio. Prototype code is untrusted: agents write it and it may come from a kit.
- Another program on the machine that guesses the ports.
- Out of scope: a network attacker (loopback only) and malware running as the same user, which can read the user's files anyway.

## Threats and controls

| STRIDE | Threat | Control | Files | ASVS |
| --- | --- | --- | --- | --- |
| S | Another site's page sends a write to the API (CSRF) | A write needs `Origin` equal to the studio's own; `Origin: null` is refused; no CORS headers at all; bodies must be JSON, and the bearer header is never CORS-safelisted. No GET changes state: taking notes from the inbox is a POST (ADR 0028) | `security/request-checks.ts`, `server/studio-handler.ts`, `http/body.ts`, `api/inbox-routes.ts` | `v5.0.0-3.5.1`, `v5.0.0-3.5.2`, `v5.0.0-3.4.2`, `v5.0.0-3.5.3` |
| S | DNS rebinding makes a hostile name point at 127.0.0.1 | `Host` must be `kitvas.localhost:<port>`, `localhost:<port>` or `127.0.0.1:<port>` (ADR 0040); repeated Host, Origin, Authorization or Content-Length is refused | `security/request-checks.ts`, `server/transport.ts` | no id fits exactly |
| S | A cross-site request is made with the browser's own headers | Fetch Metadata is checked before the token: only `same-origin`, `none` or absent pass; `Vary` names the Sec-Fetch headers | `security/request-checks.ts`, `security/response-headers.ts` | `v5.0.0-3.5.3` |
| S | A local program guesses the API port and calls it | Every API route needs the bearer token or the page cookie (see the next row): 32 random bytes each (the token per start, the page secret per project), compared in constant time over sha256 | `security/token.ts`, `server/studio-handler.ts` | `v5.0.0-7.2.3`, `v5.0.0-11.5.1`, `v5.0.0-11.2.4`, `v5.0.0-8.2.1`, `v5.0.0-8.3.1` |
| S | A local program reads a studio page | Pages need the `kitvas_<port>` cookie (`HttpOnly`, `SameSite=Strict`, `Max-Age` 30 days, ADR 0040), which a browser gets only from a one-time link: a code that works once, for 60 s, kept as its sha256. Without it a page answers 401 with a locked page that names no draft | `security/open-links.ts`, `security/page-cookie.ts`, `pages/open-route.ts`, `server/studio-handler.ts` | `v5.0.0-8.2.1`, `v5.0.0-7.2.3` |
| S | A prototype acts as the studio | It runs on the second origin in a sandbox with no token; `Origin: null` is refused on writes (see "Tampering" for the sandbox) | `server/frame-handler.ts`, `server/studio-handler.ts` | `v5.0.0-15.2.5` |
| T | A body carries extra or wrong fields | JSON only (415), 64 KiB at most (413), strict zod schemas that refuse unknown fields (422), params checked by schema | `http/body.ts`, `api/schemas.ts` | `v5.0.0-2.2.1`, `v5.0.0-2.2.2`, `v5.0.0-15.3.3` |
| T | Repeated headers or a bad message make two parts of a stack disagree (smuggling) | Repeated key headers are refused; HTTP/1.1 only; node:http's own parser rejects a repeated Content-Length; only listed methods answer (405 with `Allow`) | `server/transport.ts`, `http/listen.ts`, `http/router.ts` | `v5.0.0-4.2.1`, `v5.0.0-15.3.7`, `v5.0.0-4.1.4` |
| T | Two writers overwrite each other's change to a draft | A change needs `If-Match` with the draft's ETag: 428 without it, 412 when stale | `http/etag.ts`, `api/routes.ts` | no id fits |
| T | A prototype's file address leaves the build folder | Files come from an id-to-path map; `..`, encoded separators, backslashes, NUL, `:`, Windows device names and trailing dots or spaces are refused; symlinks are skipped; a realpath containment check; Content-Type from a fixed map. The kit examples' path `/k/<key>/<kit id>/<folder>/<file>` (ADR 0029) goes through the same map and checks, and the kit id must match the id pattern, so it cannot name another folder | `frame/frame-files.ts`, `frame/frame-url.ts`, `security/file-paths.ts` | `v5.0.0-5.3.2`, `v5.0.0-13.4.7` |
| T | Untrusted text becomes markup or a command | Templates escape every value; the frame address is URL-encoded; processes start with argument arrays and `shell: false`, and the draft slug is matched against a pattern first | `pages/html.ts`, `frame/frame-url.ts`, `jobs/cli-runner.ts`, `run/processes.ts` | `v5.0.0-1.2.1`, `v5.0.0-1.2.2`, `v5.0.0-1.2.5` |
| T | A half-written or foreign state file misleads the CLI | The file is written whole (temp file and rename) and removed only by the process it names | `run/state-file.ts` | no id fits |
| R | Nobody can tell what went wrong afterwards | Unexpected errors and job crashes go to the studio log, with the stderr tail for a crash (there is one user, so no per-user trail). Every refused request of either origin (401 or 403) gets a line: status, code, method, the path without its query, Host and Origin, cut and kept to printable ASCII, never a token, cookie or query; at most 20 a minute | `http/problem.ts`, `jobs/cli-runner.ts`, `server/start-studio.ts`, `security/denied-log.ts`, `server/studio-handler.ts`, `server/frame-handler.ts` | `v5.0.0-16.3.4`, `v5.0.0-16.3.2`, `v5.0.0-16.3.3` |
| I | The token leaks through a URL, a referrer, a cache or the prototype | The token travels only in `Authorization`, never in URLs, logs, problem details or the prototype origin; `Referrer-Policy: no-referrer`; `Cache-Control: no-store`; the events stream is read with fetch, so its token is not in the URL | `security/token.ts`, `security/response-headers.ts`, `events/event-hub.ts` | `v5.0.0-14.2.1`, `v5.0.0-3.4.5`, `v5.0.0-14.3.2` |
| I | Another site reads or frames the studio's responses | CSP with nonces (`default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`), nosniff, COOP `same-origin`, CORP `same-origin`, Permissions-Policy, on every response, errors included | `security/response-headers.ts` | `v5.0.0-3.4.3`, `v5.0.0-3.4.4`, `v5.0.0-3.4.6`, `v5.0.0-3.4.8`, `v5.0.0-3.5.8` |
| I | A failure shows internals | Errors are RFC 9457 problem details; an unexpected one is a bare 500 with no text or stack, sent to the log; an answer that fails its schema becomes a 500. A job that cannot start reports only that, and the cause goes to the log | `http/problem.ts`, `server/studio-handler.ts`, `jobs/cli-runner.ts` | `v5.0.0-16.5.1` |
| I | A prototype reads studio data or the user's files | The prototype origin answers with `Content-Security-Policy: sandbox allow-scripts` and `default-src 'none'`; the iframe has `sandbox="allow-scripts"` without `allow-same-origin`, so the page has an opaque origin; files sit under a per-start random frame key. A kit's example frames on the kit page (code a kit author wrote) are held the same way: same key, same headers, same sandbox attribute, and a fresh channel each | `server/frame-handler.ts`, `frame/frame-url.ts`, `pages/routes.ts`, `security/response-headers.ts` | `v5.0.0-3.2.1`, `v5.0.0-15.2.5` |
| I | The shared browser's endpoint is used by someone else | The browser listens on 127.0.0.1 on Playwright's random path; the endpoint goes only into the environment of the studio's own check processes, never into a log, the state file or the API | `checks/adapters/playwright-host.ts`, `jobs/shared-browser.ts` | `v5.0.0-13.3.2`, `v5.0.0-13.2.1` |
| I | Another user of the machine reads the token | The state file is written with mode 0600 | `run/state-file.ts` | `v5.0.0-13.3.2` |
| T | A project kit's text points outside the project or at something that is not a package | `repo` folders, project-path imports, provider modules, `styles.imports` and `tailwind.entry` are project-relative with no `..`, must exist and have a real path (symlinks resolved) inside the project; package specifiers match a strict npm name pattern with an optional subpath, no URLs or absolute paths (ADR 0030) | `kit/domain/sources.ts`, `kit/app/project-checks.ts`, `kit/adapters/project-files.ts` | `v5.0.0-5.3.2` |
| T | Text from `kit.json` becomes code in a generated file | `generated/kit.ts` and `kit-types.tsx` write every specifier and name with `JSON.stringify`, and component and binding names must match identifier patterns; nothing from `kit.json` is pasted unquoted | `kit/domain/generated-entry.ts`, `checks/domain/kit-types.ts` | `v5.0.0-1.2.5` |
| E | Kit or theme code of a project runs with the user's rights | It never runs in Node: Node only bundles it, and it runs in the browser, on the prototype origin in the sandbox or in the checks' browser contexts. The learner agent has no shell and writes only inside `.kitvas/kits/<id>/`; kitvas never installs a package (ADR 0030, 0031, 0032) | `render/adapters/esbuild-bundler.ts`, `checks/adapters/playwright-browser.ts`, `agents/learner.md` | `v5.0.0-15.2.5` |
| D | The Tailwind compiler of a project runs away | It runs as a child process with an argument array and no shell, 60 s, 512 MB of heap and 20 MB of output, and is killed on timeout; at most 2000 source files and 20 MB of text are scanned for classes; it loads only the project's own `tailwindcss` and `@tailwindcss/node` (ADR 0034) | `render/adapters/tailwind-css.ts`, `render/adapters/tailwind-worker.ts` | `v5.0.0-15.2.2` |
| D | Slow, huge or many requests tie up the server | Request 60 s, headers 10 s, 100 headers, 16 KiB of headers, 1000 requests per socket; 64 KiB bodies | `http/listen.ts`, `http/body.ts` | `v5.0.0-15.2.2` |
| D | A build or check job runs away | One child process per job with 120 s, 2048 MB of heap and 1 MiB of output; one job per draft or kit (`POST /api/v1/kits/{id}/catalog` is a write route like the build and check routes: the studio's Origin, the token or page cookie, a strict empty body, the kit id matched against a pattern, and 404 for an unknown kit); the stderr of a job goes only to the log. A stop ends the job's whole process tree: on Linux and macOS the job has a process group of its own that gets the signal; on Windows Node ends a process's children with it | `jobs/cli-runner.ts`, `jobs/process-tree.ts`, `jobs/jobs.ts` | `v5.0.0-15.2.2` |
| D | Tabs or notes pile up | At most 16 event streams; the inbox holds at most 100 notes; a take waits at most 600 s and there is one waiter at a time | `events/event-hub.ts`, `inbox/inbox.ts`, `api/inbox-routes.ts` | `v5.0.0-15.2.2` |
| E | Prototype code reaches the studio's origin and its token | The sandbox without `allow-same-origin`, a second origin, and no token on that origin (see the sandbox row above) | `server/frame-handler.ts`, `pages/routes.ts` | `v5.0.0-15.2.5`, `v5.0.0-3.2.1` |
| E | The CLI ends an unrelated process by a stale pid | A pid is ended by force only when the studio answered from it, or it was started just now | `run/lifecycle.ts`, `run/processes.ts` | no id fits |
| E | A dependency runs code at install | Exact version pins, a committed lockfile, `npm ci --ignore-scripts` (the session hook and CI), and `npm audit --audit-level=high` in `npm run check` | `package.json`, `package-lock.json`, `.github/workflows/check.yml` | `v5.0.0-15.2.4` |

## Not covered

- Malware running as the same user: it can read the state file and the page secret file and drive the studio.
- The page secret file's mode 0600 does little on Windows, like the state file's. A stolen cookie works for up to 30 days, until the secret file is deleted.
- `*.localhost` is resolved by the browser. Safari before macOS 26 does not, so it needs the `localhost` link (ADR 0040).
- The state file's mode 0600 does little on Windows, where file access follows the folder's ACL. The token's protection there is the user's profile folder.
- Cookies ignore ports: any other web server on 127.0.0.1 that the user opens in the same browser receives the `kitvas_<port>` cookie. Such a server is a program on the machine; running as the same user it is out of scope, running as another user it is a gap.
- The inbox lives in memory: a stop or a crash loses the notes. A note's text comes from a page and is read by Claude, so treat it as untrusted input.
- A job's stderr is also searched for the CLI's JSON answer.
- Refused requests are logged at most 20 a minute; beyond that only their count is written, with the first refusal of a later minute.
- The prototype origin shares the hostname with the studio and differs only by port; `v5.0.0-3.5.4` asks for different hostnames. The sandbox's opaque origin is what separates them. The prototype's CSP allows inline styles (`style-src ... 'unsafe-inline'`).
- No TLS and no HSTS (`v5.0.0-3.4.1`): the traffic never leaves the machine. No CSP reporting endpoint (`v5.0.0-3.4.7`). The token sits in a plain file, not a vault (`v5.0.0-13.3.1`).
- Jobs run with the user's rights; the limits stop runaways, they are not an OS sandbox. A process that a job's command starts in a process group or job object of its own would outlive a kill; none does today (tsc, esbuild and Sass do not).
- Killing the shared browser and its leftovers on exit has been tried on Windows only, not by hand on Linux or macOS.
- `npm audit` runs at level high only, and `--ignore-scripts` is set by the hook and CI, not by `package.json`.

## What leaves your machine

- The studio binds to 127.0.0.1 and needs no account. Pages need a cookie that only a one-time link gives. Prototypes run in a sandboxed frame on a second port.
- kitvas itself calls the network in three cases: the npm install of its own packages, the Chromium download when you ask for it, and a page you ask it to read. A local or private address is refused unless you pass `--allow-private`.
- The `kitvas:scout` agent searches the public web through Claude Code's own search and fetch tools, not a call of kitvas. Its queries carry only the public terms of a question, never your name, paths, code or draft text (`reference/scout.md`).
- The `kitvas:learner` agent may use a documentation MCP (Context7) for a well-known package, when you have one installed. Without it the agent reads the package alone.
- Figma is read, and a draft is sent to it, only through your own Figma MCP. A send starts after you say yes, unless a line in the `## Handoff` section of the project's `.kitvas/decisions.md` says to send without asking. kitvas holds no key and calls no Figma API itself.
- Apart from a Figma send you asked for, kitvas sends your drafts to nobody. Claude Code itself sends what it reads to the model, as in any session. That is not a kitvas feature, and it applies to the files of a draft Claude reads.

## Reporting

Report a vulnerability as described in `SECURITY.md`.
