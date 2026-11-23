# kitvas

kitvas is a Claude Code plugin. You describe a screen, Claude builds a prototype of it from your design system (React today, more to come), and kitvas builds it, checks it and shows it in a local studio, in versions.

Status: early (0.1.0).

## What you can ask for

- `/kitvas:compose`: a screen or page from a description, built section by section and fixed until its checks pass. Feedback gives a new version.
- `/kitvas:rework`: give a page you already have (a URL, a screenshot or a Figma link) and get a better version of it in your kit. The content and purpose stay the same; the layout may change. You confirm a short list of things that must stay (the logo, the main action, prices, fields), and every version is checked against it. The report says how many of the original's problems are gone.
- `/kitvas:craft`: name a component, icon or logo you are missing and show an example you like. You get three sketches in your kit's style to pick from. The one you pick goes into your project's kit, or into a folder you name.
- `/kitvas:learn`: teach kitvas your design system (below).
- `/kitvas:kit`: ask what your kit offers: components, tokens, icons.

## Your design system comes first

kitvas builds from the design system your project already has. The rework and craft skills look for it first (`kitvas kit detect`). If your project has a design system that kitvas has not learned yet, they offer to learn it before anything else, instead of quietly using the built-in kit.

kitvas can learn:

- an npm package (public or private), or a folder of your own components, with Tailwind v4 supported;
- a Figma file, read through your own Figma MCP;
- a website, or screenshots.

To set one up:

1. If it is a package, install it in your project yourself. kitvas never installs a design system.
2. Run `/kitvas:learn`. The kit lives in `.kitvas/kits/<id>/`; commit it to share it with your team.
3. `kitvas kit verify <id>` checks the kit against your real packages: imports, types, every example rendered in the browser, and the tokens. `/kitvas:learn` fixes what it reports.
4. `kitvas kit use <id>` makes it the project's kit.

What craft adds goes to `.kitvas/additions/<kit-id>/`, next to the kit, never into the kit's package.

## Checks

`kitvas check <draft>` builds a draft and checks it: the build, types, the kit's rules, and the page in a browser at 390 and 1280 px, in every state. The browser checks cover accessibility, the look (`ui`), the flow (`ux`) and errors at runtime. Every finding has a place, a message and a hint. `kitvas guidelines` lists the rules, each with the guidance it is based on.

## The studio

`kitvas studio --open` opens the project's studio in your browser. It shows:

- a gallery of drafts;
- each draft at every width, in every state and version, with its findings marked on the page;
- two versions side by side; a rework also next to its original;
- a craft draft's sketches, with the command that picks one;
- your kit: tokens, components and their examples.

Notes you leave in the studio reach Claude. The studio keeps its address (`http://kitvas.localhost:<port>/`), and your browser stays signed in for 30 days, so a bookmark works after a restart.

## What kitvas will not do

- Write into your application's code. Everything goes to `.kitvas/`, or to a folder you name when you export.
- Open a local or private address you give it, unless you allow it with `--allow-private`.
- Copy an example. A page, screenshot or logo you show gives the idea and the style, never a traced copy.

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
