# kitvas

kitvas is a Claude Code plugin. You describe a screen, Claude builds a prototype of it from your design system (React today, more to come), and kitvas builds, checks and shows it in a local studio, in versions.

Status: early. Today the plugin can report its state, create a workspace and describe its built-in kit. The compose flow is in progress.

## Use your own design system

kitvas can build prototypes from the design system your project already uses: an npm package (public or private) or a folder of your own components, with Tailwind v4 supported.

1. Install the package in your project yourself. kitvas never installs a design system.
2. Run `/kitvas:learn`. It creates a kit with `kitvas kit new`, an agent writes the kit's description from the package's types and docs, and the kit lives in `.kitvas/kits/<id>/` (commit it to share it with your team).
3. `kitvas kit verify <id>` checks the kit against your real packages: imports, types, every example rendered in the browser, and the tokens. Fix what it reports; `/kitvas:learn` does that for you.
4. `kitvas kit use <id>` makes it the project's kit. `kitvas studio` shows it under Kit, with its source and the state of its verification. `kitvas studio --open` also opens the page in your browser. The studio keeps its address (`http://kitvas.localhost:<port>/`) and your browser stays signed in for 30 days, so a bookmark works after a restart.

## Requirements

Node 24.22.3 or later in the 24 line, or 26.13.1 or later.

## What it installs

On the first session after an install or update, kitvas runs `npm ci --ignore-scripts` for its own dependencies in the plugin's data folder. This needs access to the npm registry.

## Develop

```bash
npm ci --ignore-scripts
npm run check
```

See `AGENTS.md` for the rules and `docs/adr/` for the decisions.

## License

[PolyForm Shield 1.0.0](LICENSE.md). You may use, change and share kitvas for any purpose, at work too, except to sell it or to build a product that competes with it.
