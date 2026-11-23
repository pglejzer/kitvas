# 0040. A studio address people can keep

Date: 2026-11-23. Status: accepted (owner decision, plan 9b). Supersedes the "per start" parts of ADR 0027 and the port choice of ADR 0022. Those files stay as they are.

## Context

The studio answered on `127.0.0.1` with random ports, and its page secret changed at every start. A bookmark or an open tab died when the studio restarted. The owner wants an address people can keep, like the one the superpowers visual companion shows (MIT). We read it for ideas; no code was copied.

## Decision

1. **Host names.** The servers still listen on 127.0.0.1 only. The Host check accepts `kitvas.localhost:<port>`, `localhost:<port>` and `127.0.0.1:<port>`, with the host part in any case. Addresses that kitvas prints and builds use `kitvas.localhost`. The prototype origin keeps the host name the request came to, and the CSP lists all three names for it. Every printed link has a `localhost` fallback.
2. **Stable ports.** `<data>/studio/<key>.ports.json` holds the page port and the frame port. A start tries them first. A port in use, or one Windows reserves after a reboot (`EACCES`), falls back to a free one and the file is left alone. `--port` options still win.
3. **A page secret per project.** `<data>/studio/<key>.secret` holds 32 random bytes as hex, made on the first start, with mode 0600 where the system has modes. The page cookie gets `Max-Age=2592000` (30 days). The one-time link stays the only way to get the cookie.
4. **`kitvas studio --open`** opens the one-time link in the default browser, without a shell, when the system has a display. The view says whether it opened. It is started detached with `spawn` and no shell: Windows `rundll32.exe` by its full path under `%SystemRoot%`, macOS `/usr/bin/open`, WSL the Windows browser through interop, Linux `xdg-open` only when `DISPLAY` or `WAYLAND_DISPLAY` is set. On macOS before 26 it opens the `localhost` link.
5. **Links.** `POST /api/v1/links` answers `{ url, fallbackUrl, expiresAt }`. The code works once, on either address. The CLI prints both, and the bookmark address.
6. **Skills** start the studio with `kitvas studio --open` and still give the printed link.

## Consequences

- The page secret now sits on disk. Only the same user can read it, and the threat model leaves out a program that runs as the same user.
- A cookie lasts 30 days, so a stolen cookie is useful for longer than before.
- Deleting `<key>.secret` resets every browser: each one needs a new one-time link.
- The browsers resolve `*.localhost` themselves. Chrome, Edge and Firefox do; Safari does only from macOS 26, so older Safari needs the `localhost` link.
- DNS rebinding is still refused: the Host allowlist has three exact names with the port, and none can be pointed at another machine.
- The cookie name still carries the port, so two studios keep their own cookies.
