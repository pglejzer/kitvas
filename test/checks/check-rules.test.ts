import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ChecksFileSchema, FACTS_NODE_CAP } from '../../src/checks/index.ts';
import { checkShop, fakeBrowser, t } from '../helpers/checks.ts';
import { HERO_TSX } from '../helpers/render.ts';
import { node, page, text } from './rules/facts.ts';

/** The shop's `<p>` (src/tsx/sections/Hero.tsx line 7), showing copy left from a template. */
const LOREM = node({
  ks: 'sections/Hero:section/p',
  ownKs: true,
  tag: 'p',
  landmark: 'main',
  box: [24, 120, 300, 24],
  text: text('Lorem ipsum dolor sit amet'),
});

test('a rule finding reaches checks.json with its element, state and widths', async () => {
  const fake = fakeBrowser((visit) => ({
    facts: page([LOREM], { viewport: [visit.width, visit.height], scrollWidth: visit.width }),
  }));
  const shop = checkShop({ browser: fake.browser });
  try {
    const report = await shop.check();
    const saved = ChecksFileSchema.parse(JSON.parse(readFileSync(report.path, 'utf8')));
    const found = saved.findings.find((finding) => finding.rule === 'ux/placeholder-text');
    assert.ok(found, 'ux/placeholder-text is in checks.json');
    assert.deepEqual(
      [found.check, found.severity, found.element, found.file, found.line],
      ['ux', 'fix', 'sections/Hero:section/p', 'src/tsx/sections/Hero.tsx', 7],
    );
    assert.deepEqual([found.states, found.widths], [['filled'], [390, 1280]]);
    assert.deepEqual([saved.checks.ui, saved.checks.ux], ['ran', 'ran']);
    // No --deep: the file does not say deep, and no deep width was visited.
    assert.equal(saved.deep, undefined);
    assert.deepEqual(
      fake.visits.map((visit) => visit.width),
      [390, 1280],
    );
    assert.deepEqual(saved.notes, []);
  } finally {
    await shop.close();
  }
});

test('facts cut at the node cap: the rules still report, and a note says so', async () => {
  const fake = fakeBrowser((visit) => ({
    facts: page([LOREM], {
      viewport: [visit.width, visit.height],
      scrollWidth: visit.width,
      truncated: visit.width === 1280,
    }),
  }));
  const shop = checkShop({ browser: fake.browser });
  try {
    const report = await shop.check();
    assert.deepEqual(report.notes, [t('check.note.factsTruncated', { cap: FACTS_NODE_CAP })]);
    assert.ok(report.findings.some((finding) => finding.rule === 'ux/placeholder-text'));
  } finally {
    await shop.close();
  }
});

test('a page that measured no element leaves only runtime/blank', async () => {
  const fake = fakeBrowser((visit) => ({
    rendered: false,
    facts: page([], { viewport: [visit.width, visit.height], scrollWidth: visit.width }),
  }));
  const shop = checkShop({ browser: fake.browser });
  try {
    const report = await shop.check();
    assert.deepEqual(
      report.findings.map((finding) => [finding.rule, finding.widths]),
      [['runtime/blank', [390, 1280]]],
    );
  } finally {
    await shop.close();
  }
});

test('the source rules read the TSX and the sheets; a TSX finding gets its element', async () => {
  const shop = checkShop();
  try {
    const hero = HERO_TSX.replace(
      '      <p>State: {state}</p>\n',
      '      <p>State: {state}</p>\n      <input\n        aria-label="Search"\n        autoFocus\n      />\n',
    );
    shop.write('src/tsx/sections/Hero.tsx', hero);
    shop.write(
      'src/scss/sections/hero.scss',
      '.hero {\n  color: var(--kit-color-ink);\n  transition: all 0.2s;\n}\n',
    );
    const report = await shop.check();
    const find = (rule: string) => report.findings.find((finding) => finding.rule === rule);
    const autofocus = find('ux/autofocus');
    assert.deepEqual(
      [autofocus?.check, autofocus?.file, autofocus?.line, autofocus?.element],
      ['ux', 'src/tsx/sections/Hero.tsx', 10, 'sections/Hero:section/input'],
    );
    assert.deepEqual([autofocus?.states, autofocus?.widths], [[], []]);
    const transition = find('ui/transition-all');
    assert.deepEqual(
      [transition?.check, transition?.file, transition?.line, transition?.element],
      ['ui', 'src/scss/sections/hero.scss', 3, null],
    );
  } finally {
    await shop.close();
  }
});
