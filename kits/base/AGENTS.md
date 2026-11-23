# kits/base

The built-in kit. Its tokens and look come from the approved "quiet studio" design: do not add colours, shadows, gradients or icon packages.

- `kit.json` is the catalog agents read. A component, prop, value or icon exists for agents only when it is listed there. Change the source and the catalog together.
- One component per file in `tsx/<category>/`, where the folder is the `category` of its catalog entry (`action`, `input`, `layout`, `typography`, `display`, `overlay`). Shared helpers live in `tsx/core/`. Only `index.ts`, which exports every component, sits directly in `tsx/`.
- Function components, `{...rest}` forwarded: layout and display components to the root element, field components to the form control.
- Styles in `scss/<category>/`, one partial per component group, listed in `scss/index.scss`; mixins and base rules in `scss/core/`. Use `--kit-*` names of `json/tokens.json` only; a property local to one component starts with `--_`.
- Icons are stroke paths on a 20 by 20 grid in `tsx/display/icon-paths.ts`. A new icon goes there, into `icons.names` and into the `name` prop of `Icon` in `kit.json`.
- `test/kit/base-kit.test.ts` checks all of the above, including that no file sits loose outside a category folder. Run it after any change here.
