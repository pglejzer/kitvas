import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FONT_FACES } from '../../../../src/studio/pages/fonts.ts';
import { SKIN_BASE } from '../../../../src/studio/pages/skin/base.ts';
import { SKIN_CONTROLS } from '../../../../src/studio/pages/skin/controls.ts';
import { SHARED_RULES } from '../../../../src/studio/pages/skin/index.ts';
import { SKIN_MOTION } from '../../../../src/studio/pages/skin/motion.ts';
import { SKIN_SURFACES } from '../../../../src/studio/pages/skin/surfaces.ts';
import { SKIN_VIEW } from '../../../../src/studio/pages/skin/view.ts';
import { themeCss, themeNames } from '../../../../src/studio/theme/theme-css.ts';

const PARTS = {
  base: SKIN_BASE,
  controls: SKIN_CONTROLS,
  surfaces: SKIN_SURFACES,
  motion: SKIN_MOTION,
  view: SKIN_VIEW,
};

test('the shared rules are the five parts, in the order they apply', () => {
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
  const css = `${SKIN_BASE}${SKIN_CONTROLS}${SKIN_SURFACES}${SKIN_MOTION}`;
  const classes = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1] ?? ''));
  // Decimal numbers and file-like words are no classes.
  const own = [...classes].filter((name) => !/^\d/.test(name));
  assert.ok(own.length > 40);
  for (const name of own) assert.ok(name.startsWith('k-'), `.${name}`);
});
