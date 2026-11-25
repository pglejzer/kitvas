import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box, FactNode, PageFacts, RawFinding } from '../../../src/checks/index.ts';
import { DEEP_WIDTH_RULE_IDS, VISIT_RULES, visitPlan } from '../../../src/checks/index.ts';
import { node, page, visit } from './facts.ts';

function run(id: string, nodes: FactNode[], part: Partial<PageFacts> = {}): RawFinding[] {
  const rule = VISIT_RULES.find((entry) => entry.id === id);
  assert.ok(rule, id);
  return rule.run(visit(page(nodes, part)));
}

const picture = (box: Box, natural: [number, number], part: { vector?: boolean } = {}): FactNode =>
  node({
    tag: 'img',
    ks: 'sections/Hero:img/0',
    box,
    image: { natural, sized: true, alt: 'Photo', vector: part.vector ?? false },
  });

const field = (type: string, width: number): FactNode =>
  node({
    tag: 'input',
    ks: 'sections/Form:input/0',
    box: [0, 0, width, 40],
    field: {
      control: 'input',
      type,
      name: 'email',
      value: '',
      placeholder: '',
      required: false,
      invalid: false,
      autocomplete: '',
      label: 'visible',
      labelText: 'Email',
      labelBox: null,
      described: [],
      group: -1,
      groupName: '',
      form: -1,
      mark: null,
    },
  });

const hints = (found: RawFinding[]) => found.map((finding) => finding.hint.params);
const wide = { viewport: [1920, 1080] as [number, number] };

test('a raster image shown wider than 1.25 times its file is soft', () => {
  const soft = run('ui/upscaled-image', [picture([0, 0, 600, 300], [400, 300])]);
  assert.equal(soft.length, 1);
  assert.deepEqual(hints(soft), [{ shown: 600, natural: 400 }]);
  assert.deepEqual(run('ui/upscaled-image', [picture([0, 0, 500, 300], [400, 300])]), []);
});

test('a taller than natural image counts too', () => {
  const found = run('ui/upscaled-image', [picture([0, 0, 400, 420], [400, 300])]);
  assert.equal(found.length, 1);
  assert.deepEqual(hints(found), [{ shown: 420, natural: 300 }]);
});

test('a vector image is never upscaled', () => {
  const svg = picture([0, 0, 1200, 900], [400, 300], { vector: true });
  assert.deepEqual(run('ui/upscaled-image', [svg]), []);
});

test('an image with no natural size is left out', () => {
  assert.deepEqual(run('ui/upscaled-image', [picture([0, 0, 600, 300], [0, 0])]), []);
});

test('a field wider than 640 px on a wide page is stretched', () => {
  const found = run('ui/stretched-field', [field('email', 900)], wide);
  assert.equal(found.length, 1);
  assert.deepEqual(hints(found), [{ width: 900 }]);
  assert.deepEqual(run('ui/stretched-field', [field('email', 600)], wide), []);
});

test('a wide field on a phone is fine', () => {
  assert.deepEqual(run('ui/stretched-field', [field('email', 900)]), []);
});

test('a checkbox, a radio or a hidden field never counts', () => {
  for (const type of ['checkbox', 'radio', 'hidden']) {
    assert.deepEqual(run('ui/stretched-field', [field(type, 900)], wide), [], type);
  }
});

test('both wide rules run at the deep widths', () => {
  assert.ok(DEEP_WIDTH_RULE_IDS.includes('ui/upscaled-image'));
  assert.ok(DEEP_WIDTH_RULE_IDS.includes('ui/stretched-field'));
});

test('a deep plan visits 1920 and 2560 too, and a plain one stops at 390, 1280 and 768', () => {
  assert.deepEqual(
    visitPlan(true).map((plan) => plan.width),
    [390, 1280, 768, 1024, 1440, 1920, 2560],
  );
  assert.deepEqual(
    visitPlan(false).map((plan) => plan.width),
    [390, 1280, 768],
  );
});
