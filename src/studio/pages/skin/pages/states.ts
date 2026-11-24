// States: the studio stopped, a locked page. Calm: a title, one sentence and one next step, in a
// single card on the ground; no illustration. The states inside the draft page (a version not
// built, a draft that cannot be read) are `.k-empty` in the editor's own skin.
// Plan 18, task E. Studio tokens only (`--st-*`); shared classes are `../` (`k-`).

export const SKIN_STATES = `
/* A page that is only a state: the card in the middle of the window. */
.state-main {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: var(--st-space-24) var(--st-space-16);
}
.state-card {
  display: grid;
  gap: var(--st-space-12);
  width: min(440px, 100%);
  padding: var(--st-space-24);
  border-radius: var(--st-radius-lg);
  background: var(--st-color-panel);
  box-shadow: var(--st-shadow-low);
}
.state-card > p { color: var(--st-color-ink-mid); }
/* The paused view (ADR 0042) takes the page's place once the studio has stopped. */
body[data-paused] {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: var(--st-space-24) var(--st-space-16);
}
body[data-paused] > :not(.state-paused):not(.k-sprite) { display: none; }
.state-paused { margin: 0; }
/* The script moves focus here: the ring shows where it went, for mouse users too. */
.state-paused:focus {
  outline: 2px solid var(--st-color-accent);
  outline-offset: 4px;
  border-radius: var(--st-radius-lg);
}
`;
