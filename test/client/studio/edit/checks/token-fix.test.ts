// The token that fixes a finding of the full check (plan 18f, task 4), the plan of "Use <token>",
// the time since a check, and the words of Ask Claude. Forty findings are all listed (server test).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REQUEST_TEXT } from '../../../../../client/studio/edit/ai/requests.ts';
import { askRequest } from '../../../../../client/studio/edit/checks/ask-text.ts';
import type { FindingFacts } from '../../../../../client/studio/edit/checks/evidence.ts';
import { ranAgo } from '../../../../../client/studio/edit/checks/ran.ts';
import {
  colourProperty,
  fixToken,
  planOf,
} from '../../../../../client/studio/edit/checks/token-fix.ts';
import type { TokenOption } from '../../../../../src/edit/index.ts';

const token = (path: string, name: string, css: string): TokenOption => ({
  var: `--kit-${name}`,
  path,
  type: 'color',
  css,
});
const INK = token('color.ink', 'color-ink', '#1d2025');
const INK_MID = token('color.inkMid', 'color-ink-mid', '#6a707a');
const INK_SOFT = token('color.inkSoft', 'color-ink-soft', '#a4a9b2');
const KIT = [INK, INK_MID, INK_SOFT];

const contrast = (fg: string, needed = '4.5'): FindingFacts => ({
  rule: 'a11y/color-contrast',
  message: 'Elements must meet minimum color contrast ratio thresholds',
  hint: `Element has insufficient color contrast of 3.9 (foreground color: ${fg}, background color: #ffffff, font size: 12.0pt). Expected contrast ratio of ${needed}:1`,
  element: 'sections/Plans:section/Stack/Price',
});

test('an off-kit colour is fixed by its nearest token', () => {
  const finding: FindingFacts = {
    rule: 'ds/raw-color',
    message: '"#1a73e8" is a colour written by hand.',
    hint: '',
    element: 'sections/Plans:section/Stack/Button',
  };
  assert.deepEqual(fixToken(finding, KIT), { token: '--kit-color-ink-mid', label: 'inkMid' });
  assert.equal(fixToken(finding, []), null);
});

test('a contrast fix is the nearest kit colour that passes, or none', () => {
  assert.deepEqual(fixToken(contrast('#8e949e'), KIT), {
    token: '--kit-color-ink-mid',
    label: 'inkMid',
  });
  // Nothing in this kit reaches 7:1 on white except the darkest, and with none it is `null`.
  assert.equal(fixToken(contrast('#8e949e', '30'), KIT), null);
  assert.equal(fixToken({ ...contrast('#8e949e'), rule: 'ui/line-length' }, KIT), null);
});

test('the colour is set where the element rule holds it', () => {
  const styles = {
    scss: {
      declarations: [
        { property: 'gap', value: '12px', offKit: true },
        { property: 'background', value: '#1A73E8', offKit: true },
      ],
    },
  };
  assert.equal(colourProperty(styles, '#1a73e8'), 'background');
  assert.equal(colourProperty(styles, '#000'), null);
  assert.equal(colourProperty({ scss: null }, '#1a73e8'), null);
  const plan = planOf('background', INK);
  assert.deepEqual(plan.changes[0]?.value, { token: '--kit-color-ink' });
});

test('the time since the check is said in minutes, hours and days', () => {
  const now = 10 * 24 * 3_600_000;
  assert.equal(ranAgo(now - 5_000, now).key, 'checks.ran.now');
  assert.deepEqual(ranAgo(now - 60_000, now), { key: 'checks.ran.minute', count: 1 });
  assert.deepEqual(ranAgo(now - 5 * 60_000, now), { key: 'checks.ran.minutes', count: 5 });
  assert.deepEqual(ranAgo(now - 3 * 3_600_000, now), { key: 'checks.ran.hours', count: 3 });
  assert.deepEqual(ranAgo(now - 3 * 24 * 3_600_000, now), { key: 'checks.ran.days', count: 3 });
  assert.equal(ranAgo(now + 9_000, now).key, 'checks.ran.now');
});

test('Ask Claude is a say request about the element, within the limit', () => {
  const finding = contrast('#8e949e');
  const request = askRequest({ ...finding, hint: 'x '.repeat(MAX_REQUEST_TEXT) });
  assert.equal(request.kind, 'say');
  assert.deepEqual(request.elements, [finding.element]);
  assert.ok(request.text.length <= MAX_REQUEST_TEXT);
  assert.ok(request.text.includes('a11y/color-contrast'));
  assert.deepEqual(askRequest({ ...finding, element: null }).elements, []);
});
