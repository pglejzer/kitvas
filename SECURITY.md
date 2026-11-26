# Security

## Reporting a vulnerability

Open a private security advisory on the GitHub repository ("Security" tab, "Report a vulnerability"). Do not open a public issue for a vulnerability. You will get a reply within seven days.

## What kitvas runs on your machine

- A session hook that installs the plugin's npm dependencies with `npm ci --ignore-scripts`.
- The `kitvas` command line, started by Claude Code from skills.
- `kitvas studio`: a local server bound to 127.0.0.1 that shows your drafts. It runs as a separate process until `kitvas studio stop`. Its session token is kept in `<data folder>/studio/<key>.json`, readable by your user only. Prototypes run in a sandboxed frame on a second port. The threats and controls are in `docs/security.md` ("Threats and controls"), and the decisions in `docs/adr/0022-studio-server.md` and `docs/adr/0023-studio-process.md`.
