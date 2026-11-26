# app-a

- One component per file in `src/components/`, named like the component (`Button.tsx`), styled with a CSS Module beside it (`Button.module.css`).
- Pages live in `src/pages/` and are registered in `src/App.tsx`.
- Colours and spacing come from the variables in `src/styles/tokens.css`. No raw colours in a component's styles.
- Class names are joined with `clsx`.
