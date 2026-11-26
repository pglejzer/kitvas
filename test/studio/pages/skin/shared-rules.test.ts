import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONT_FACES } from '../../../../src/studio/pages/fonts.ts';
import { SKIN_BASE } from '../../../../src/studio/pages/skin/base.ts';
import { SKIN_CONTROLS } from '../../../../src/studio/pages/skin/controls.ts';
import { SHARED_RULES } from '../../../../src/studio/pages/skin/index.ts';
import { SKIN_LOGO } from '../../../../src/studio/pages/skin/logo.ts';
import { SKIN_MOTION } from '../../../../src/studio/pages/skin/motion.ts';
import { SKIN_SURFACES } from '../../../../src/studio/pages/skin/surfaces.ts';
import { SKIN_VIEW } from '../../../../src/studio/pages/skin/view.ts';
import { themeCss, themeNames } from '../../../../src/studio/theme/theme-css.ts';

const PARTS = {
  base: SKIN_BASE,
  controls: SKIN_CONTROLS,
  surfaces: SKIN_SURFACES,
  logo: SKIN_LOGO,
  motion: SKIN_MOTION,
  view: SKIN_VIEW,
};

test('the shared rules are the six parts, in the order they apply', () => {
  assert.equal(SHARED_RULES, Object.values(PARTS).join(''));
});

test('a shared rule reads only studio tokens, and only ones the theme defines', () => {
  const names = themeNames();
  for (const [part, css] of Object.entries(PARTS)) {
    assert.ok(!css.includes('--kit-'), `${part}: no kit token`);
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1] ?? '');
    for (const name of used) assert.ok(names.has(name), `${part}: ${name} is a studio token`);
  }
  assert.ok((SHARED_RULES.match(/var\(--st-/g)?.length ?? 0) > 100);
});

test('a shared rule never writes a colour by hand', () => {
  for (const [part, css] of Object.entries(PARTS)) {
    // The unicode ranges of the font are no colours, and `white-space` is no colour word.
    const rules = css.replaceAll(/unicode-range:[^;]+;/g, '');
    assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b(?!-)/i, part);
  }
});

test('soft grey is for marks, never for text', () => {
  for (const [part, css] of Object.entries(PARTS)) {
    assert.doesNotMatch(css, /(^|[\s;{])color:\s*var\(--st-color-ink-soft\)/, part);
  }
});

test('every animation a rule names has its keyframes', () => {
  const frames = new Set(
    [...SHARED_RULES.matchAll(/@keyframes ([a-z-]+)/g)].map((match) => match[1]),
  );
  const used = [...SHARED_RULES.matchAll(/animation: ([a-z-]+)/g)].map((match) => match[1]);
  assert.ok(used.length >= 4);
  for (const name of used) {
    if (name !== 'none') assert.ok(frames.has(name), `${name} has keyframes`);
  }
});

test("the logo's motion: an entrance once for a tab, a working sign, nothing on hover", () => {
  // The entrance plays only on a logo that plays, while the page started one.
  for (const part of ['k-logo-icon', 'k-logo-letter', 'k-logo-dot path']) {
    assert.ok(
      SKIN_LOGO.includes(`:root[data-logo-enter] .k-logo[data-play] .${part} {`),
      `${part} enters`,
    );
  }
  // Six letters, 45 ms apart from 160 ms, set by their place: no inline style.
  const delays = [...SKIN_LOGO.matchAll(/:nth-child\((\d)\) \{ animation-delay: (\d+)ms; \}/g)];
  assert.deepEqual(
    delays.map((match) => [Number(match[1]), Number(match[2])]),
    [1, 2, 3, 4, 5, 6].map((n) => [n, 160 + (n - 1) * 45]),
  );
  // The loose parts land turned as their rule turns them; the full stop sways while Claude works.
  assert.match(SKIN_LOGO, /\.k-logo-dot path \{[^}]*transform: rotate\(-15deg\);/);
  assert.match(
    SKIN_LOGO,
    /:root\[data-claude="working"\] \.k-logo\[data-claude\] \.k-logo-stop path \{\s*animation: k-logo-sway 1\.2s ease-in-out infinite;/,
  );
  // The same state nudges the right part of the icon, and only moves transform.
  assert.match(
    SKIN_LOGO,
    /:root\[data-claude="working"\] \.k-logo\[data-claude\] \.k-logo-joint \{\s*animation: k-logo-fit 1\.2s ease-in-out infinite;/,
  );
  assert.match(SKIN_LOGO, /@keyframes k-logo-fit \{ 50% \{ transform: translateX\(1\.5px\); \} \}/);
  // Opacity and transform move. Nothing moves on hover.
  assert.doesNotMatch(SKIN_LOGO, /:hover/);
  for (const frames of SKIN_LOGO.matchAll(/@keyframes [a-z-]+ \{([\s\S]*?\})\s*\}/g)) {
    const properties = [...(frames[1] ?? '').matchAll(/([a-z-]+):/g)].map(
      (match) => match[1] ?? '',
    );
    for (const property of properties) {
      assert.ok(['opacity', 'transform'].includes(property), property);
    }
  }
});

test('motion is off under reduced motion, and while the view changes', () => {
  assert.match(
    SKIN_MOTION,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/,
  );
  assert.match(SKIN_MOTION, /:root\[data-view-changing\] \*[^{]*\{\s*transition: none !important;/);
});

test('the typeface is served by the studio itself, one face per file of the package', () => {
  const faces = [...SKIN_VIEW.matchAll(/@font-face \{[^}]+\}/g)].map((match) => match[0]);
  assert.equal(faces.length, FONT_FACES.length);
  FONT_FACES.forEach((face, index) => {
    const css = faces[index] ?? '';
    assert.ok(css.includes(`src: url("/assets/fonts/${face.file}") format("woff2");`));
    assert.ok(css.includes('font-family: "Figtree";'));
    assert.ok(css.includes('font-weight: 300 900;'));
    assert.ok(css.includes('font-display: swap;'));
    assert.ok(css.includes(`unicode-range: ${face.range};`));
  });
  assert.doesNotMatch(SHARED_RULES, /https?:\/\//);
  assert.match(themeCss(), /--st-font-body:\s*"?Figtree/);
});

test('shared classes start with k-, so they never meet a class of a page', () => {
  const css = `${SKIN_BASE}${SKIN_CONTROLS}${SKIN_SURFACES}${SKIN_LOGO}${SKIN_MOTION}`;
  const classes = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1] ?? ''));
  // Decimal numbers and file-like words are no classes.
  const own = [...classes].filter((name) => !/^\d/.test(name));
  assert.ok(own.length > 40);
  for (const name of own) assert.ok(name.startsWith('k-'), `.${name}`);
});
