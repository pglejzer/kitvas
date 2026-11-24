// The studio's skin, shared rules: the View popover (theme, panels, accent) that every page's
// bar opens (\`pages/view-settings.ts\`, \`client/studio/ui/view-settings.ts\`), and the font.

import { ACCENTS } from '../../theme/tokens.ts';
import { FONT_FACES } from '../fonts.ts';

const swatches = ACCENTS.map(
  (accent) => `.view-accent[data-value="${accent}"] { background: var(--st-swatch-${accent}); }`,
).join('\n');

const faces = FONT_FACES.map(
  (face) => `@font-face {
  font-family: "Figtree";
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url("/assets/fonts/${face.file}") format("woff2");
  unicode-range: ${face.range};
}`,
).join('\n');

export const SKIN_VIEW = `
${faces}
.view-pop {
  position: fixed;
  top: calc(var(--st-size-bar) + var(--st-space-6));
  right: var(--st-space-12);
  z-index: 70;
  display: grid;
  gap: var(--st-space-10);
  width: 280px;
  padding: var(--st-space-12);
}
.view-pop-title { font-size: var(--st-font-size-md); font-weight: var(--st-font-weight-bold); }
.view-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-10);
  color: var(--st-color-ink-mid);
}
.view-accents { display: flex; gap: var(--st-space-8); }
.view-accent {
  width: var(--st-size-target);
  height: var(--st-size-target);
  border-radius: var(--st-radius-full);
}
.view-accent[aria-pressed="true"] { outline: 2px solid var(--st-color-ink); outline-offset: 2px; }
${swatches}
.view-note[data-failed] { color: var(--st-color-fix); }
`;
