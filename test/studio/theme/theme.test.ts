import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastRatio, laidOver, withAlpha } from '../../../src/studio/theme/contrast.ts';
import { themeCss, themeNames } from '../../../src/studio/theme/theme-css.ts';
import {
  ACCENT_COLORS,
  ACCENTS,
  ON_SELECT,
  ON_TONE,
  SOFT_ALPHA,
  THEME_COLORS,
  THEMES,
} from '../../../src/studio/theme/tokens.ts';

/** The ratio of two colours the tokens hold; a value that is no hex colour fails the test. */
function ratio(a: string, b: string): number {
  const value = contrastRatio(a, b);
  assert.ok(value !== null, `${a} and ${b} are hex colours`);
  return value;
}

const SURFACES = ['panel', 'raised', 'raised-strong', 'pressed', 'pop'] as const;

test('contrast is the WCAG ratio, and an alpha is mixed before it is measured', () => {
  assert.equal(Math.round(ratio('#000000', '#ffffff')), 21);
  assert.equal(ratio('#777777', '#777777'), 1);
  assert.equal(laidOver('#000000', 0.5, '#ffffff'), '#808080');
  assert.equal(withAlpha('#ff0000', 0.1), 'rgb(255 0 0 / 0.1)');
  assert.equal(contrastRatio('red', '#ffffff'), null);
});

test('text reads on every surface of both themes', () => {
  for (const theme of THEMES) {
    const colors = THEME_COLORS[theme];
    for (const surface of SURFACES) {
      for (const ink of ['ink', 'ink-mid'] as const) {
        const value = ratio(colors[ink], colors[surface]);
        assert.ok(value >= 4.5, `${theme}: ${ink} on ${surface} is ${value.toFixed(2)}`);
      }
    }
  }
});

test('the tones read as text on a panel and on a raised item', () => {
  for (const theme of THEMES) {
    const colors = THEME_COLORS[theme];
    for (const tone of ['fix', 'review', 'good'] as const) {
      for (const surface of ['panel', 'raised'] as const) {
        const value = ratio(colors[tone], colors[surface]);
        assert.ok(value >= 4.5, `${theme}: ${tone} on ${surface} is ${value.toFixed(2)}`);
      }
    }
  }
});

test('every accent reads as text, carries text, and its soft fill keeps the ink readable', () => {
  for (const theme of THEMES) {
    const colors = THEME_COLORS[theme];
    for (const accent of ACCENTS) {
      const { accent: fill, on } = ACCENT_COLORS[accent][theme];
      const where = `${theme} ${accent}`;
      assert.ok(ratio(on, fill) >= 4.5, `${where}: text on the accent`);
      assert.ok(ratio(fill, colors.panel) >= 4.5, `${where}: the accent on a panel`);
      assert.ok(ratio(fill, colors.pop) >= 4.5, `${where}: the accent on a popover`);
      const soft = laidOver(fill, SOFT_ALPHA[theme], colors.panel);
      assert.ok(soft !== null);
      assert.ok(ratio(colors.ink, soft) >= 4.5, `${where}: ink on the soft fill`);
      assert.ok(ratio(colors['ink-mid'], soft) >= 4.5, `${where}: quiet ink on the soft fill`);
    }
  }
});

test('the selection colour shows on a white draft and on a dark one', () => {
  for (const accent of ACCENTS) {
    const { select } = ACCENT_COLORS[accent];
    assert.ok(ratio(select, '#ffffff') >= 3, `${accent} on white`);
    assert.ok(ratio(select, '#1d2025') >= 3, `${accent} on a dark draft`);
    assert.ok(ratio(ON_SELECT, select) >= 4.5, `${accent}: the text of a tag`);
  }
});

test('a tone used as a fill carries its text', () => {
  for (const theme of THEMES) {
    for (const tone of ['fix', 'review', 'good'] as const) {
      const fill = THEME_COLORS[theme][tone];
      assert.ok(ratio(ON_TONE[theme], fill) >= 4.5, `${theme}: text on ${tone}`);
    }
  }
});

test('soft grey is too weak for text, which is why no rule may use it as text', () => {
  for (const theme of THEMES) {
    const colors = THEME_COLORS[theme];
    assert.ok(ratio(colors['ink-soft'], colors.panel) < 4.5);
    assert.ok(ratio(colors['ink-soft'], colors.panel) >= 3, `${theme}: soft grey marks show`);
  }
});

test('the sheet gives both themes the same names, and each accent its own values', () => {
  const css = themeCss();
  const names = (text: string): string[] =>
    [...text.matchAll(/(--st-(?:color|shadow|swatch)-[a-z0-9-]+):/g)].map(
      (match) => match[1] ?? '',
    );
  const dark = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const light = /:root\[data-theme="light"\] \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(names(dark).length > 20);
  assert.deepEqual(names(dark).sort(), names(light).sort());
  // A dark system gets the dark set while no theme is chosen.
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n:root:not\(\[data-theme\]\) \{/);
  for (const accent of ACCENTS) {
    assert.ok(css.includes(`--st-raw-accent-dark: ${ACCENT_COLORS[accent].dark.accent};`));
    assert.ok(css.includes(`--st-swatch-${accent}:`));
  }
  assert.match(css, /:root\[data-accent="teal"\] \{/);
  assert.doesNotMatch(css, /:root\[data-accent="copper"\]/);
});

test('rules read the public names only', () => {
  const names = themeNames();
  for (const name of ['--st-color-accent', '--st-space-8', '--st-shadow-pop', '--st-motion-fast']) {
    assert.ok(names.has(name), name);
  }
  assert.ok([...names].every((name) => !name.startsWith('--st-raw-')));
});
