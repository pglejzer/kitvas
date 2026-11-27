import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CRAFT_RULES,
  type CraftFacts,
  type CraftRule,
  guidelineFor,
  type Message,
  type RawFinding,
  type SvgFacts,
  type VisitInput,
} from '../../../src/checks/index.ts';
import { node, page, visit } from './facts.ts';

/** A sketch block the facts walk listed, with its element id. */
const BLOCK = 'craft:main/section';
const IDS = [{ id: BLOCK, file: 'src/tsx/index.tsx', line: 12, column: 7, tag: 'section' }];
const BOARD: VisitInput = visit(
  page([node({ tag: 'main' }), node({ tag: 'section', ks: BLOCK })]),
  {
    seen: { ids: IDS },
  },
);

/** Sketch A drawn like the kit's icons: a 20 grid, stroke 1.75, round caps, currentColor. */
function svg(part: Partial<SvgFacts> = {}): SvgFacts {
  return {
    sketch: 'A',
    node: null,
    viewBox: '0 0 20 20',
    stroke: 1.75,
    filled: false,
    caps: 'round',
    fixedColours: [],
    thinnestPx16: 1.4,
    thinnestPx32: 2.8,
    ...part,
  };
}

const kitIcon = (part: Partial<SvgFacts> = {}): SvgFacts =>
  svg({ sketch: null, thinnestPx16: null, thinnestPx32: null, ...part });

/** An icon board whose sketch A matches the kit in every way. */
function craft(part: Partial<CraftFacts> = {}): CraftFacts {
  return {
    subject: 'icon',
    sketches: [svg()],
    kit: [kitIcon(), kitIcon(), kitIcon({ viewBox: '0 0 24 24', stroke: 2 })],
    logoContrast: [],
    mono: [],
    ...part,
  };
}

/** A logo board whose sketch A has a mono tone and good contrast. */
function logo(part: Partial<CraftFacts> = {}): CraftFacts {
  return craft({
    subject: 'logo',
    sketches: [svg({ fixedColours: ['#2563ebff'] }), svg()],
    kit: [],
    logoContrast: [{ sketch: 'A', light: 18.88, dark: 18.88 }],
    mono: ['A'],
    ...part,
  });
}

function rule(id: string): CraftRule {
  const found = CRAFT_RULES.find((entry) => entry.id === id);
  assert.ok(found, id);
  return found;
}

const run = (id: string, facts: CraftFacts, on: VisitInput = BOARD): RawFinding[] =>
  rule(id).run({ visit: on, craft: facts });

const say = (key: string, params: Message['params'] = {}): Message => ({ key, params });

/** A finding of the board's baseline at 390: at the sketch's block, or page-level. */
function expected(
  id: string,
  severity: RawFinding['severity'],
  message: Message,
  hint: Message,
  atBlock = false,
): RawFinding {
  return {
    check: 'ui',
    rule: id,
    severity,
    ...(atBlock
      ? { file: 'src/tsx/index.tsx', line: 12, column: 7 }
      : { file: null, line: 0, column: 0 }),
    element: atBlock ? BLOCK : null,
    message,
    hint,
    states: ['filled'],
    widths: [390],
  };
}

test('every craft rule has its book entry, with the severity the rule reports', () => {
  assert.deepEqual(
    CRAFT_RULES.map((entry) => [entry.id, guidelineFor(entry.id)?.severity]),
    [
      ['ui/icon-grid', 'fix'],
      ['ui/icon-stroke', 'review'],
      ['ui/icon-colour', 'fix'],
      ['ui/icon-small', 'review'],
      ['ui/logo-mono', 'fix'],
      ['ui/logo-small', 'review'],
      ['ui/logo-contrast', 'fix'],
    ],
  );
  assert.deepEqual(guidelineFor('ui/icon-stroke')?.thresholds, { tolerance: 0.25 });
  assert.equal(guidelineFor('ui/logo-contrast')?.basis, 'source');
});

test('a sketch that matches the kit, and a logo that is mono, small-safe and clear: all silent', () => {
  for (const entry of CRAFT_RULES) {
    assert.deepEqual(entry.run({ visit: BOARD, craft: craft() }), [], entry.id);
    assert.deepEqual(entry.run({ visit: BOARD, craft: logo() }), [], entry.id);
  }
});

test('empty input: no sketches and no kit icons give no finding', () => {
  for (const subject of ['icon', 'logo', 'component']) {
    const empty = craft({ subject, sketches: [], kit: [], logoContrast: [], mono: [] });
    for (const entry of CRAFT_RULES)
      assert.deepEqual(entry.run({ visit: BOARD, craft: empty }), []);
  }
});

test('ui/icon-grid: a viewBox other than the one most kit icons use', () => {
  const off = craft({ sketches: [svg({ viewBox: '0 0 24 24' }), svg({ sketch: 'B' })] });
  assert.deepEqual(run('ui/icon-grid', off), [
    expected(
      'ui/icon-grid',
      'fix',
      say('checkRule.uiIconGrid', { sketch: 'A', grid: '0 0 20 20' }),
      say('checkHint.uiIconGrid', { viewBox: '0 0 24 24', grid: '0 0 20 20' }),
    ),
  ]);
  // A kit with no icons, or none with a viewBox, sets no grid.
  assert.deepEqual(run('ui/icon-grid', craft({ sketches: [svg({ viewBox: '' })], kit: [] })), []);
  const bare = craft({
    sketches: [svg({ viewBox: '0 0 24 24' })],
    kit: [kitIcon({ viewBox: '' })],
  });
  assert.deepEqual(run('ui/icon-grid', bare), []);
});

test('ui/icon-stroke: outside the kit range by more than the tolerance', () => {
  // The kit strokes run from 1.75 to 2: up to 2.25 is fine, 2.5 is not.
  assert.deepEqual(run('ui/icon-stroke', craft({ sketches: [svg({ stroke: 2.25 })] })), []);
  assert.deepEqual(run('ui/icon-stroke', craft({ sketches: [svg({ stroke: 1.5 })] })), []);
  assert.deepEqual(run('ui/icon-stroke', craft({ sketches: [svg({ stroke: 2.5 })] })), [
    expected(
      'ui/icon-stroke',
      'review',
      say('checkRule.uiIconStroke', { sketch: 'A', min: 1.75, max: 2 }),
      say('checkHint.uiIconStroke', { stroke: 2.5, tolerance: 0.25 }),
    ),
  ]);
  // A filled sketch next to a stroked kit has a stroke of 0.
  const filled = craft({ sketches: [svg({ stroke: null, filled: true })] });
  assert.deepEqual(
    run('ui/icon-stroke', filled).map((finding) => finding.hint),
    [say('checkHint.uiIconStroke', { stroke: 0, tolerance: 0.25 })],
  );
  // A filled kit has no strokes to compare with.
  const filledKit = craft({ sketches: [svg({ stroke: 3 })], kit: [kitIcon({ stroke: null })] });
  assert.deepEqual(run('ui/icon-stroke', filledKit), []);
});

test('ui/icon-colour: fixed colours of a sketch, once per sketch', () => {
  const fixed = craft({
    sketches: [
      svg({ fixedColours: ['#ff0000ff'] }),
      svg({ fixedColours: ['#111111ff', '#ff0000ff'] }),
      svg({ sketch: 'B' }),
    ],
  });
  assert.deepEqual(run('ui/icon-colour', fixed), [
    expected(
      'ui/icon-colour',
      'fix',
      say('checkRule.uiIconColour', { sketch: 'A' }),
      say('checkHint.uiIconColour', { colours: '#111111ff #ff0000ff' }),
    ),
  ]);
});

test('ui/icon-small: the thinnest line at 16 px under one pixel', () => {
  const thin = craft({ sketches: [svg({ thinnestPx16: 0.5 })] });
  assert.deepEqual(run('ui/icon-small', thin), [
    expected(
      'ui/icon-small',
      'review',
      say('checkRule.uiIconSmall', { sketch: 'A', min: 1 }),
      say('checkHint.uiIconSmall', { px: 0.5 }),
    ),
  ]);
  // Exactly one pixel is enough; nothing measured says nothing.
  assert.deepEqual(run('ui/icon-small', craft({ sketches: [svg({ thinnestPx16: 1 })] })), []);
  assert.deepEqual(run('ui/icon-small', craft({ sketches: [svg({ thinnestPx16: null })] })), []);
});

test('ui/logo-mono: a sketch with no one-colour tone', () => {
  const twoSketches = logo({
    sketches: [svg(), svg({ sketch: 'B' })],
    logoContrast: [],
    mono: ['A'],
  });
  assert.deepEqual(run('ui/logo-mono', twoSketches), [
    expected(
      'ui/logo-mono',
      'fix',
      say('checkRule.uiLogoMono', { sketch: 'B' }),
      say('checkHint.uiLogoMono'),
    ),
  ]);
});

test('ui/logo-small: the thinnest line at 32 px, the lowest of the tones', () => {
  const thin = logo({ sketches: [svg({ thinnestPx32: 2 }), svg({ thinnestPx32: 0.8 })] });
  assert.deepEqual(run('ui/logo-small', thin), [
    expected(
      'ui/logo-small',
      'review',
      say('checkRule.uiLogoSmall', { sketch: 'A', min: 1 }),
      say('checkHint.uiLogoSmall', { px: 0.8 }),
    ),
  ]);
  // A logo is not held to the 16 px rule.
  assert.deepEqual(run('ui/icon-small', logo({ sketches: [svg({ thinnestPx16: 0.2 })] })), []);
});

test('ui/logo-contrast: under 3:1 on the light or the dark ground', () => {
  const faint = logo({
    logoContrast: [
      { sketch: 'A', light: 1.53, dark: 12.1 },
      { sketch: 'B', light: 3, dark: 3 },
    ],
  });
  assert.deepEqual(run('ui/logo-contrast', faint), [
    expected(
      'ui/logo-contrast',
      'fix',
      say('checkRule.uiLogoContrast', { sketch: 'A', min: 3 }),
      say('checkHint.uiLogoContrast', { light: 1.53, dark: 12.1, min: 3 }),
    ),
  ]);
  const dark = logo({ logoContrast: [{ sketch: 'A', light: 5, dark: 2.99 }] });
  assert.equal(run('ui/logo-contrast', dark).length, 1);
});

test('icon rules stay silent on a logo board and logo rules on an icon board', () => {
  const broken = {
    sketches: [
      svg({ viewBox: '0 0 99 99', stroke: 9, fixedColours: ['#ff0000ff'] }),
      svg({ thinnestPx16: 0.1, thinnestPx32: 0.1 }),
    ],
    logoContrast: [{ sketch: 'A', light: 1, dark: 1 }],
    mono: [],
  };
  const icons = ['ui/icon-grid', 'ui/icon-stroke', 'ui/icon-colour', 'ui/icon-small'];
  const logos = ['ui/logo-mono', 'ui/logo-small', 'ui/logo-contrast'];
  for (const id of icons) {
    assert.equal(run(id, craft(broken)).length, 1, id);
    assert.deepEqual(run(id, logo({ ...broken, kit: craft().kit })), [], id);
    assert.deepEqual(run(id, craft({ ...broken, subject: 'component' })), [], id);
  }
  for (const id of logos) {
    assert.equal(run(id, logo(broken)).length, 1, id);
    assert.deepEqual(run(id, craft(broken)), [], id);
  }
});

test('a finding sits at the sketch block when the facts list it, else it is page-level', () => {
  const at = craft({ sketches: [svg({ node: 1, fixedColours: ['#ff0000ff'] })] });
  const found = run('ui/icon-colour', at);
  assert.deepEqual(
    found.map((finding) => [finding.element, finding.file, finding.line, finding.severity]),
    [[BLOCK, 'src/tsx/index.tsx', 12, 'fix']],
  );
  // A node index outside the visit's facts is never trusted.
  const lost = craft({ sketches: [svg({ node: 7, fixedColours: ['#ff0000ff'] })] });
  assert.deepEqual(
    run('ui/icon-colour', lost).map((finding) => [finding.element, finding.file]),
    [[null, null]],
  );
  // The logo rules find the block through the sketch's svgs.
  const mono = logo({ sketches: [svg({ sketch: 'B', node: 1 })], logoContrast: [], mono: [] });
  assert.deepEqual(
    run('ui/logo-mono', mono).map((finding) => finding.element),
    [BLOCK],
  );
});
