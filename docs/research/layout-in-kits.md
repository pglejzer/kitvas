# Page layout in design systems, and what a kit should capture

Question: when kitvas learns a kit from a project's code, the app's pages stand on shared layout classes
(Bootstrap 4 `.container`, `.row`, `.col-md-10 .offset-md-1`) that no project component draws. Is turning
those classes into `layout` components (Container, Row, Col) universal or Bootstrap-specific?

Research date 2026-11-28. Sources are official docs unless marked. Fetch notes: the Polaris React docs
(polaris-react.shopify.com) now redirect to a general shopify.dev page, so Polaris facts below come from
search-result excerpts only. The Material 3 window-size-class page returned 404. The Atlassian Stack page
and the Carbon page did not say whether Carbon ships React Grid/Column components (not claimed here).

## Summary

- The grid itself is not Bootstrap-specific. Every system checked has a page frame made of the same three
  pieces: a page container (max width, centered, side margin), a column grid (a column count, a gutter, named
  breakpoints), and spacing primitives for stacking and inline runs.
- The form differs. React-first systems (MUI, React-Bootstrap, Radix Themes, Chakra, Atlassian) ship these
  pieces as components. Class-first systems (GOV.UK, Bootstrap itself, Tailwind) ship them as CSS classes. In
  every system the values (breakpoints, max widths, gutters, space scale) are named tokens or theme settings.
- So "layout classes become Container/Row/Col components" is right for a React kit, but only as one case.
  The universal thing is: page container + column grid (columns, gutter, breakpoints) + spacing primitives.
  Row/Col with offset enums is how Bootstrap spells the grid, not the unit to hard-code.
- Bootstrap's names are not the only ones, but they are widespread: React-Bootstrap has `Container`, `Row`,
  `Col` with `span`/`offset`/`order` per breakpoint. MUI has `Container` and `Grid` (size per breakpoint,
  12 columns). GOV.UK has `govuk-width-container`, `govuk-grid-row`, `govuk-grid-column-two-thirds`.
- Modern guidance leans to few intrinsic primitives (Stack, Box, Inline, Cluster, Sidebar, Grid, Center/
  Container) over per-page CSS or per-breakpoint overrides (Every Layout, Atlassian primitives). Both
  styles agree on one point: layout lives in a shared, named, reused layer, not invented per page.
- Technology-neutral rule for the learner: record (1) the page container: max width(s), horizontal padding,
  centering; (2) the column system if there is one: column count, gutter, breakpoints, how a width/offset is
  expressed; (3) the vertical/horizontal rhythm primitives: stack gap, inline gap, section spacing, from the
  space scale; (4) breakpoint names and values; and (5) which of these are components, classes or plain
  CSS in this app. Output them as tokens plus, where the app has a repeated structure, layout components.
- Naming props "after the classes" (`md`, `offset`) is fine when the app uses a Bootstrap-like grid, because
  React-Bootstrap does exactly that. For a non-grid app, props should name the thing the app repeats
  (`size="narrow"`, `gap="lg"`), never a class grid the app does not have.
- Breakpoints, gutters and widths are tokens in practice (Bootstrap Sass maps, Tailwind `--breakpoint-*`,
  Atlassian `space.*` gutters, Radix `--container-*`, Chakra `theme.sizes.container`). The Design Tokens
  format spec has no breakpoint or layout type, only `dimension`, so they are stored as dimension tokens.

## 1. How established systems model page layout

Pieces that recur: page container, column grid, spacing/stack primitives. Form per system:

| System | Container | Column grid | Spacing primitives | Form |
|---|---|---|---|---|
| Bootstrap 5 | `.container`, `.container-fluid`, `.container-md` | `.row` + `.col-md-4`, 12 columns | gutters `.g-*`, spacing utilities | classes (Sass maps) |
| React-Bootstrap | `Container` | `Row`, `Col` (`span`, `offset`, `order`) | gutters | components |
| MUI | `Container` (`maxWidth`) | `Grid` (12 columns, per-breakpoint size) | `Stack`, `spacing` prop | components |
| Atlassian | (grid guidance) | 12-column grid, guide plus Figma layout component | `Box`, `Inline`, `Stack` | guidance + primitive components + tokens |
| Radix Themes | `Container` (`size` 1 to 4) | `Grid` | `Flex`, `Box`, `Section` | components + CSS vars |
| Chakra | `Container` | `Grid` | `Flex`, `Stack` | components + theme tokens |
| GOV.UK | `govuk-width-container`, `govuk-main-wrapper` | `govuk-grid-row`, `govuk-grid-column-two-thirds` | spacing scale classes | classes |
| Tailwind | `container` + `mx-auto px-*` | `grid grid-cols-*` utilities | `gap-*`, `space-*` | utility classes + theme vars |
| Carbon 2x grid | grid guidance | 4/8/16 fluid columns per breakpoint | spacing scale | guidance (+ code package) |
| Polaris | (search excerpt only) | `InlineGrid` | `BlockStack`, space tokens | components + tokens |

Evidence:

- Bootstrap grid is container, row, column; the container "centers and horizontally pads" content, columns
  have gutter padding, 12 columns, six breakpoints with container max widths 540/720/960/1140/1320 px,
  gutter 1.5rem, all driven by Sass variables `$grid-breakpoints`, `$container-max-widths`,
  `$grid-gutter-width`. https://getbootstrap.com/docs/5.3/layout/grid/
- React-Bootstrap models the same as components: Container centers content and adds horizontal padding;
  Row sets columns per breakpoint; Col takes `span`, `offset`, `order` per breakpoint.
  https://react-bootstrap.github.io/docs/layout/grid/
- MUI Grid: five breakpoints xs to xl, "Column widths are integer values between 1 and 12", `spacing` prop for
  gaps, built on flexbox; the page tells you to put a Stack inside a Grid item to stack vertically.
  https://mui.com/material-ui/react-grid/ . MUI Container "centers your content horizontally", bounded by
  `maxWidth`. https://mui.com/material-ui/react-container/
- Atlassian: three layout primitives (Box, Inline, Stack) "make it easier to implement our design tokens";
  Box is "a generic container with managed access to design tokens"; in Figma they map to Auto Layout.
  https://atlassian.design/foundations/spacing/primitives . The grid is guidance plus a Figma layout
  component and code built from box, stack and inline: 12 columns, gutters 12 px (`space.150`) on
  mobile/tablet and 16 px (`space.200`) on desktop, margins 16 or 32 px, fixed-wide max width 1296 px,
  fixed-narrow 864 px. https://atlassian.design/foundations/grid . Base space unit 8 px, `space.100`.
  https://atlassian.design/foundations/spacing
- Radix Themes Container: `size` 1 to 4 maps to 448/688/880/1136 px via `--container-1..4`, customizable
  by CSS variable; shares padding, sizing and grid props with Box, Flex, Grid.
  https://www.radix-ui.com/themes/docs/components/container
- Chakra Container: constrains width, max widths from `theme.sizes.container`, composes Box.
  https://v2.chakra-ui.com/docs/components/container
- GOV.UK: layout is classes, not components. `govuk-width-container` sets the max width (default 1020 px)
  and adds no vertical spacing; `govuk-main-wrapper` gives vertical padding; `govuk-grid-row` plus
  `govuk-grid-column-two-thirds` (and full, one-half, one-third, one-quarter, three-quarters, `-from-desktop`
  variants). https://design-system.service.gov.uk/styles/layout/
- Tailwind: `container` is only a max-width ladder per breakpoint, it does not center or pad (`mx-auto px-4`
  added by the author). https://tailwindcss.com/docs/container
- Carbon 2x grid: columns fixed per breakpoint (4 at 320, 8 at 672, 16 at 1056 and up), optional gutter
  (16 px padding + 16 px margin), breakpoints Small 320, Medium 672, Large 1056, X-Large 1312, Max 1584.
  https://carbondesignsystem.com/elements/2x-grid/overview/
- Polaris (from a search excerpt, page itself not fetched): `InlineGrid` takes `gap` as a space token or a
  per-breakpoint object of tokens; space tokens are for padding, margin and gap, base 4 px
  (`space-100` = 4 px). Polaris is moving these to web components `<s-stack>`, `<s-grid>`.
  https://polaris-react.shopify.com/components/layout-and-structure/inline-grid and
  https://shopify.dev/docs/apps/build/checkout/migrate-to-web-components/inline-stack (both via search results)
- Material 3 (not fetched, 404): M3 describes layout as window size classes, columns, margins; MUI is the
  component implementation of the older Material grid.

Reading: container and grid are always present; whether they are classes, components or guidance depends on
the system's stack. Stack/Inline primitives exist in the component-first systems (MUI, Atlassian, Chakra,
Polaris, Radix `Flex`); GOV.UK and Bootstrap express them as spacing classes.

## 2. Are layout primitives as components the recommended practice?

- Yes in component-first design systems, with a reason stated: primitives give managed access to space tokens
  so pages do not hard-code pixels (Atlassian "make it easier to implement our design tokens").
  https://atlassian.design/foundations/spacing/primitives
- Every Layout argues the same from the CSS side: build layouts by composing a small set of single-purpose
  primitives (Stack, Box, Center, Cluster, Sidebar, Switcher, Cover, Grid, Frame, Reel, Imposter, Icon,
  Container) instead of per-component layout CSS, "most CSS bloat" comes from repeating layout rules, and
  components that each define their own layout cause inconsistency. They also claim layouts that need no
  `@media` breakpoints. https://every-layout.dev/layouts/ and
  https://every-layout.dev/rudiments/composition/
- Counterpoint: GOV.UK, Bootstrap and Tailwind keep layout in classes and nobody calls that wrong. The shared
  point is a named, shared layer. Leaving layout to ad-hoc page CSS is what the sources warn against;
  classes versus components is a stack choice.
- Caution from MUI: Grid is not a vertical-stacking tool; use Stack for that. So a kit that only had a
  Row/Col pair would still miss the vertical rhythm primitive. https://mui.com/material-ui/react-grid/
- Tailwind's container does not center or pad by itself: the "container" in one system is not the same unit as
  in another, so the learner must record behavior (max width, centering, padding), not just the class name.
  https://tailwindcss.com/docs/container

Conclusion for the owner's question: the idea (shared page-frame classes become kit layout components) is in
line with good practice, but the rule should be phrased around the page frame, not around Bootstrap names.

## 3. What to capture when the app has no class grid

For plain CSS Grid or flex per page, or a utility framework, the same three units exist implicitly:

1. Page container: max width (or a ladder of max widths per breakpoint), horizontal padding or margin,
   centering. Radix `--container-*`, Atlassian fixed-wide 1296 / fixed-narrow 864, GOV.UK 1020 px are all this.
2. Column structure, if any: column count, gutter, margin, per breakpoint (Carbon 4/8/16, Atlassian 12,
   Bootstrap 12). In grid/flex per page this is `grid-template-columns` and `gap`. If pages differ and the
   structure is not repeated, there is nothing to capture beyond the gap tokens.
3. Rhythm: stack gap, inline gap, section padding, taken from a space scale (Atlassian `space.100` = 8 px,
   Polaris `space-100` = 4 px, Tailwind `gap-*`). Repeated vertical stack or horizontal cluster patterns
   become Stack/Inline primitives.
4. Named breakpoints with values (Bootstrap sm to xxl, Tailwind sm to 2xl, Carbon small to max).
5. Repeated page shapes (centered narrow column, two-thirds plus one-third, sidebar plus content). These are
   Every Layout's Center, Sidebar, Switcher, and GOV.UK's two-thirds/one-third pattern.

A technology-neutral learner instruction, as a draft:

> Find how the app's pages are framed: the widths they are capped at, the side padding, how many columns and
> what gutter, the breakpoint values, and the gaps between repeated blocks. Record values as tokens. Where the
> same frame structure repeats across pages (a width wrapper, a row of columns, a vertical run, a sidebar
> pair), write a `layout` component for it whose props name the app's own variations (its class names if it
> has a class grid, otherwise sizes such as narrow/wide and gaps from the space scale).

This is a proposal built from the sources above, not a quoted practice.

## 4. Breakpoints and gutters: tokens or not

- Design Tokens Format Module (W3C Community Group draft) defines types color, dimension, font family, font
  weight, duration, cubic bezier, number, plus composites (border, shadow, typography...). It has no spacing,
  breakpoint or layout type; spacing appears only as a group of `dimension` tokens in examples, and groups
  must not be used to infer a token's purpose. So breakpoints and gutters are stored as `dimension` tokens by
  convention. https://www.designtokens.org/TR/drafts/format/ (first 100,000 of 115,332 chars read)
- Practice (search excerpts, secondary sources, not official specs): systems publish breakpoint tokens used
  in media queries, and grid tokens per breakpoint (columns, outer margin, gutter, max container), with
  min-width mobile-first ranges. Examples listed by the search: Texas, Dynatrace, VA, Agriculture AU, VTEX.
  Low authority; I did not open them. Search results only.
- Naming across the systems checked:
  - Bootstrap: `xs, sm, md, lg, xl, xxl` = 0, 576, 768, 992, 1200, 1400 px; container maxes in
    `$container-max-widths`; gutter `$grid-gutter-width` 1.5rem. https://getbootstrap.com/docs/5.3/layout/grid/
  - Tailwind: `sm, md, lg, xl, 2xl` = 40, 48, 64, 80, 96 rem; customized with `--breakpoint-*` theme vars.
    https://tailwindcss.com/docs/responsive-design
  - MUI: `xs, sm, md, lg, xl`. https://mui.com/material-ui/react-grid/
  - Carbon: Small 320, Medium 672, Large 1056, X-Large 1312, Max 1584.
    https://carbondesignsystem.com/elements/2x-grid/overview/
  - Atlassian: `xxs` 320 to 479, `xs`, `s`, and up; gutters and margins are space tokens (`space.150`,
    `space.200`, `space.400`). https://atlassian.design/foundations/grid
  - Radix: container widths as `--container-1..4`. Chakra: `theme.sizes.container`.
- Common names are t-shirt sizes (xs to xxl); numeric suffixes also occur (Radix, Atlassian space). Grid
  values in Bootstrap must be px, not rem or %, which a learner should keep as the app's unit.

## Open points

- Material 3 and Polaris React docs could not be fetched directly; Carbon's React component API was not
  confirmed. If those matter, check them by hand.
- Style Dictionary docs were not fetched; its handling of breakpoint tokens is not claimed.
