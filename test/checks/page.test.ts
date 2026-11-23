import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IdEntry } from '../../src/checks/domain/ids.ts';
import {
  a11yFindings,
  buildPath,
  type PageReport,
  runtimeFindings,
} from '../../src/checks/domain/page.ts';

const IDS: IdEntry[] = [
  {
    id: 'sections/Hero:section/img',
    file: 'src/tsx/sections/Hero.tsx',
    line: 8,
    column: 7,
    tag: 'img',
  },
];
const SEEN = { state: 'filled', width: 390, ids: IDS };

const REPORT: PageReport = {
  rendered: false,
  console: [
    { type: 'error', text: 'Failed to load resource: net::ERR_FILE_NOT_FOUND' },
    { type: 'error', text: 'Each child in a list should have a unique "key" prop.' },
    { type: 'warning', text: 'Old API' },
  ],
  pageErrors: ['boom'],
  failedRequests: [
    { url: 'file:///C:/w/v1/build/img/my%20cat.png', reason: 'net::ERR_FILE_NOT_FOUND' },
  ],
  violations: [],
  usage: [],
  shot: true,
};

test('axe violations are placed at the nearest element; impact sets the severity', () => {
  const findings = a11yFindings(
    [
      {
        id: 'image-alt',
        impact: 'critical',
        help: 'Images must have alternative text',
        nodes: [
          {
            element: 'sections/Hero:section/img',
            summary: 'Fix any of the following:\n  Element does not have an alt attribute\n',
          },
        ],
      },
      {
        id: 'list',
        impact: 'moderate',
        help: 'Lists are lists',
        nodes: [{ element: null, summary: '' }],
      },
    ],
    SEEN,
  );
  assert.deepEqual(findings[0], {
    check: 'a11y',
    rule: 'a11y/image-alt',
    severity: 'fix',
    file: 'src/tsx/sections/Hero.tsx',
    line: 8,
    column: 7,
    element: 'sections/Hero:section/img',
    message: { key: 'checkRule.tool', params: { text: 'Images must have alternative text' } },
    hint: {
      key: 'checkRule.tool',
      params: { text: 'Fix any of the following:\n  Element does not have an alt attribute' },
    },
    states: ['filled'],
    widths: [390],
  });
  assert.deepEqual(
    [findings[1]?.severity, findings[1]?.file, findings[1]?.element],
    ['review', null, null],
  );
});

test('the page itself: blank, errors, console and files that did not load', () => {
  const findings = runtimeFindings(REPORT, SEEN);
  assert.deepEqual(
    findings.map((finding) => [finding.rule, finding.severity, finding.message]),
    [
      ['runtime/blank', 'fix', { key: 'checkRule.blank', params: { state: 'filled' } }],
      ['runtime/page-error', 'fix', { key: 'checkRule.tool', params: { text: 'boom' } }],
      [
        'runtime/console-error',
        'fix',
        {
          key: 'checkRule.tool',
          params: { text: 'Each child in a list should have a unique "key" prop.' },
        },
      ],
      ['runtime/console-warning', 'review', { key: 'checkRule.tool', params: { text: 'Old API' } }],
      [
        'runtime/request-failed',
        'fix',
        {
          key: 'checkRule.requestFailed',
          params: { url: 'build/img/my cat.png', reason: 'net::ERR_FILE_NOT_FOUND' },
        },
      ],
    ],
  );
  assert.deepEqual(findings[0]?.hint, { key: 'checkHint.blank', params: {} });
  assert.deepEqual(findings[2]?.hint, { key: 'checkHint.console', params: {} });
  assert.deepEqual(findings[4]?.hint, { key: 'checkHint.requestFailed', params: {} });
  assert.deepEqual([findings[0]?.states, findings[0]?.widths], [['filled'], [390]]);
  assert.deepEqual(
    runtimeFindings(
      { ...REPORT, rendered: true, console: [], pageErrors: [], failedRequests: [] },
      SEEN,
    ),
    [],
  );
});

test('a file address of the build is shown from the build folder on', () => {
  assert.equal(buildPath('file:///C:/w/v1/build/img/a.png'), 'build/img/a.png');
  assert.equal(buildPath('https://example.test/a.png'), 'https://example.test/a.png');
});
