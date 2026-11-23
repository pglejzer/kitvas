# 0033. Component styles in the bundle

Date: 2026-11-23. Status: accepted. Adds to `0030-project-kits.md`. Spec: `docs/specs/2026-11-23-kitvas-stage-2a-project-kits-design.md`, section 5. Evidence: `docs/spikes/09-component-styles.md`.

## Context

Company components import their own styles: plain CSS, CSS Modules, Sass. Base has none of this; its styles are token sheets. A prototype that renders the components without those styles looks broken.

## Decision

- The bundler port returns `css` next to `js`. esbuild collects `.css` imported from JS into one CSS output; `.module.css` uses the `local-css` loader (scoped class names, `composes` works); `.scss` and `.module.scss` are compiled through the session's one Sass compiler, with the project's `node_modules` as a load path, and then handled the same way.
- Fonts and images referenced from CSS become data URLs (the frame's CSP allows `data:` for images and fonts).
- Sheet order in `build/css/index.css`: tokens, Tailwind CSS when the kit uses it (ADR 0034), the kit's style files, the bundle's CSS, then the draft's own sheets.
- Errors in CSS or Sass are build errors, not silent gaps.
- The `ds` check still reads only the draft's own sheets; the kit's CSS is not checked.

## Consequences

A spike with four style kinds in one build produced one JS and one CSS file in import order, with scoped names matching between JS and CSS. Kit styles cannot be overridden by accident: the draft's sheets come last. CSS-in-JS libraries that need a server setup are not covered here; such components go to `gaps` as `unsupported`. The build's cache key grows with the kit's style files.
