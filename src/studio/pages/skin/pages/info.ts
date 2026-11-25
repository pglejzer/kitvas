// The Guide, Shortcuts and Doctor pages, in the start page's look: its column and block (`start.ts`),
// then cards on the canvas in grids that fill the column. Only the info- variants are here.
// Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_INFO = `
/* The short block: a line back, the title, the lead and the page's own row. The selectors name
   both classes, so they win over the start page's rules whichever file comes first. */
.info-block .info-block-in {
  min-height: 220px;
  align-content: center;
  justify-items: start;
  gap: var(--st-space-12);
}
.info-block .start-giant { right: -24px; bottom: -110px; height: 360px; }
.info-back {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-6);
  color: var(--st-color-ink-mid);
  font-size: var(--st-font-size-sm);
  text-decoration: none;
}
.info-back:hover { color: var(--st-color-ink); text-decoration: underline; }
.info-block h1 { color: var(--st-color-ink); font-size: 32px; font-weight: var(--st-font-weight-medium); }
.info-block .start-lead { max-width: 60ch; }
.info-hint { display: flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-6); color: var(--st-color-ink-mid); }
.info-doctor-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--st-space-12) var(--st-space-24); }
.info-counts { display: flex; flex-wrap: wrap; gap: var(--st-space-4) var(--st-space-16); margin: 0; padding: 0; list-style: none; }
.info-count { display: inline-flex; align-items: center; gap: var(--st-space-6); }
.info-count[data-zero] { color: var(--st-color-ink-mid); }
.info-actions { display: flex; flex-wrap: wrap; gap: var(--st-space-8); }

/* A group of cards under a small heading. */
.info-group { display: grid; gap: var(--st-space-12); min-width: 0; }
.info-group > h2 { font-size: var(--st-font-size-xl); }
.info-note { color: var(--st-color-ink-mid); }
.info-cards { display: grid; gap: var(--st-space-12); margin: 0; padding: 0; list-style: none; min-width: 0; }
.info-cards-skills { grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); }
.info-cards-keys { grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); align-items: start; }

/* A card is the start page's step card. */
.info-card {
  display: grid;
  align-content: start;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--st-space-8);
  min-width: 0;
  padding: var(--st-space-16);
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.info-card-pad { padding: 20px; }
.info-card > h2 { font-size: var(--st-font-size-lg); }
/* A long path or command breaks where it must, so a card is never wider than its column. */
.info-card > p { color: var(--st-color-ink-mid); max-width: 68ch; overflow-wrap: anywhere; }
.info-card dd, .info-command > span { overflow-wrap: anywhere; }
.info-link { color: var(--st-color-accent); text-underline-offset: 3px; }
.info-list { display: grid; gap: var(--st-space-8); margin: 0; padding: 0; list-style: none; }

/* How it works: four step cards in a row, then two, then one. */
.start-steps.info-steps-4 { grid-template-columns: minmax(0, 1fr); }

/* A skill: its name, its command, what you give and get. */
.info-gg { display: grid; gap: var(--st-space-4); margin: 0; }
.info-gg > div { display: grid; gap: var(--st-space-2); }
.info-gg dt { color: var(--st-color-ink-mid); font-size: var(--st-font-size-sm); }
.info-gg dd { margin: 0; color: var(--st-color-ink); }

/* The row of three cards. */
.info-trio { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--st-space-12); align-items: start; }

/* A terminal command: its name, then what it does. */
.info-command { display: grid; grid-template-columns: 6rem minmax(0, 1fr); align-items: baseline; gap: var(--st-space-12); }
.info-command > span { color: var(--st-color-ink-mid); }

/* Shortcuts: the label on the left, its ways on the right, a hairline between rows. */
.info-keys { margin: 0; padding: 0; list-style: none; }
.info-key {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-16);
  min-height: var(--st-size-row);
  padding-block: var(--st-space-6);
}
.info-key + .info-key { border-top: 1px solid var(--st-color-line); }
.info-key-ways { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--st-space-6); }
.info-key-way { display: inline-flex; align-items: center; gap: var(--st-space-2); }
.info-plus { color: var(--st-color-ink-mid); font-size: var(--st-font-size-xs); }

/* Doctor: the checks and the report side by side, a row per check. */
.info-doctor { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--st-space-12); align-items: start; }
.info-check { display: grid; grid-template-columns: 6px 5.5rem minmax(0, 1fr); align-items: baseline; gap: var(--st-space-10); }
.info-check > .k-dot { align-self: center; }
.info-check-id { font-family: var(--st-font-mono); font-size: var(--st-font-size-sm); }
.info-check-text { display: grid; gap: var(--st-space-2); min-width: 0; }
.info-check-text > .k-meta { color: var(--st-color-ink-mid); }
.info-report { align-items: flex-start; padding-block: var(--st-space-6); min-width: 0; }
.info-report > pre { flex: 1; min-width: 0; margin: 0; overflow-x: auto; white-space: pre; }

/* The foot line marks the page it is on. */
.start-foot a[aria-current="page"] { color: var(--st-color-ink); }

@media (min-width: 640px) {
  .start-steps.info-steps-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .start-steps.info-steps-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .info-trio { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .info-doctor { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); }
  .info-doctor-one { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 1023px) {
  .info-block .info-block-in { min-height: 0; }
}
@media (max-width: 40rem) {
  .info-command { grid-template-columns: minmax(0, 1fr); gap: var(--st-space-4); }
  .info-key { align-items: flex-start; flex-direction: column; gap: var(--st-space-4); }
  .info-key-ways { justify-content: flex-start; }
}
`;
