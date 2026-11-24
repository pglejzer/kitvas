import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EDITOR_PARTS, EDITOR_RULES } from '../../../../src/studio/pages/skin/editor/index.ts';
import { SHARED_RULES } from '../../../../src/studio/pages/skin/index.ts';
import { PAGE_PARTS, PAGE_RULES } from '../../../../src/studio/pages/skin/pages/index.ts';
import { themeNames } from '../../../../src/studio/theme/theme-css.ts';

/** Every area file of the skin, under `<folder>/<file>`. */
const AREAS: [string, string][] = [
  ...Object.entries(PAGE_PARTS).map(([name, css]): [string, string] => [`pages/${name}`, css]),
  ...Object.entries(EDITOR_PARTS).map(([name, css]): [string, string] => [`editor/${name}`, css]),
];

const classesOf = (css: string): Set<string> =>
  new Set(
    [...css.replaceAll(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-z][a-z0-9-]*)/g)].map(
      (match) => match[1] ?? '',
    ),
  );

test('the area rules are every area file, joined', () => {
  assert.equal(PAGE_RULES, Object.values(PAGE_PARTS).join(''));
  assert.equal(EDITOR_RULES, Object.values(EDITOR_PARTS).join(''));
});

test('an area rule reads only studio tokens, and only ones the theme defines', () => {
  const names = themeNames();
  for (const [area, css] of AREAS) {
    assert.ok(!css.includes('--kit-'), `${area}: no kit token`);
    for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
      const name = match[1] ?? '';
      // A rule may read a custom property a script sets on the element (`--x`, `--depth`).
      if (name.startsWith('--st-')) assert.ok(names.has(name), `${area}: ${name} is defined`);
    }
  }
});

test('an area rule never writes a colour by hand', () => {
  for (const [area, css] of AREAS) {
    const rules = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b(?!-)/i, area);
  }
});

test('soft grey is for marks, never for text', () => {
  for (const [area, css] of AREAS) {
    assert.doesNotMatch(css, /(^|[\s;{])color:\s*var\(--st-color-ink-soft\)/, area);
  }
});

test('nothing the anti-slop rules ban: no gradient, blur, glow or all-caps label', () => {
  for (const [area, css] of AREAS) {
    assert.doesNotMatch(
      css,
      /gradient\(|backdrop-filter|filter:\s*blur|text-transform:\s*uppercase/,
      area,
    );
  }
});

test('an area defines no class of the shared rules again, and no keyframes of its own name twice', () => {
  const shared = classesOf(SHARED_RULES);
  const seen = new Map<string, string>();
  for (const [area, css] of AREAS) {
    for (const name of classesOf(css)) {
      if (name.startsWith('k-')) {
        assert.ok(shared.has(name), `${area}: .${name} is not a shared class`);
      }
    }
    for (const match of css.matchAll(/@keyframes ([a-z0-9-]+)/g)) {
      const name = match[1] ?? '';
      assert.ok(!name.startsWith('k-'), `${area}: @keyframes ${name} takes a shared name`);
      assert.equal(
        seen.get(name),
        undefined,
        `${area}: @keyframes ${name} is also in ${seen.get(name)}`,
      );
      seen.set(name, area);
    }
  }
});

test('motion in an area uses the studio times, so reduced motion and the view change turn it off', () => {
  for (const [area, css] of AREAS) {
    const rules = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
    for (const match of rules.matchAll(/(?:transition|animation)(?:-duration)?:\s*([^;}]+)/g)) {
      const value = match[1] ?? '';
      assert.doesNotMatch(
        value,
        /\b\d*\.?\d+m?s\b/,
        `${area}: a time written by hand in "${value}"`,
      );
    }
  }
});
