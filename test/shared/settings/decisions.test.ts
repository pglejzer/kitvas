import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDecision,
  DECISION_SECTIONS,
  decisionsTemplate,
  isOneLine,
  isValidSetting,
  parseDecisions,
  replaceDecision,
  swapDecision,
  withDecision,
  withSetting,
} from '../../../src/shared/settings/decisions.ts';

const DAY = '2026-11-25';

test('Windows line ends and a BOM read like any other file, and the body is kept as written', () => {
  const body = '# Title\r\n\r\n## Kits\r\n- one (2026-01-01)\r\n';
  const parsed = parseDecisions(`﻿---\r\nkit: acme\r\ncheck: deep\r\n---\r\n${body}`);
  assert.deepEqual(parsed.settings, { kit: 'acme', check: 'deep' });
  assert.deepEqual(parsed.lines, { kit: 2, check: 3 });
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.body, body);
});

test('a file with no front matter has no settings and the whole text as body', () => {
  const text = '# Title\n\n## Kits\n- one (2026-01-01)\n';
  const parsed = parseDecisions(text);
  assert.deepEqual(parsed.settings, {});
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.body, text);
  assert.deepEqual(parseDecisions('').settings, {});
  assert.equal(parseDecisions('').body, '');
});

test('a block that never closes is a warning and the whole text is body', () => {
  const text = '---\nkit: acme\n# no end\n';
  const parsed = parseDecisions(text);
  assert.deepEqual(parsed.settings, {});
  assert.equal(parsed.body, text);
  assert.deepEqual(
    parsed.warnings.map((warning) => [warning.code, warning.line]),
    [['unclosedBlock', 1]],
  );
});

test('two kit lines: the first valid one wins and a warning names the rest', () => {
  const parsed = parseDecisions('---\nkit: acme\nkit: other\n---\n');
  assert.equal(parsed.settings.kit, 'acme');
  assert.deepEqual(parsed.warnings, [
    { code: 'duplicateKey', line: 3, params: { key: 'kit', first: 2 } },
  ]);
  // A first line that is not valid does not count: the next valid one wins.
  const later = parseDecisions('---\nkit: A B\nkit: acme\n---\n');
  assert.equal(later.settings.kit, 'acme');
  assert.deepEqual(
    later.warnings.map((warning) => [warning.code, warning.line]),
    [['badValue', 2]],
  );
});

test('values with quotes or spaces, bad values, unknown keys and odd lines are warnings', () => {
  const parsed = parseDecisions(
    '---\n# a comment\n\nkit: "acme"\ncopy: Polish\ncheck: very deep\nmode: x\nwhat is this\n---\n',
  );
  assert.deepEqual(parsed.settings, {});
  assert.deepEqual(
    parsed.warnings.map((warning) => [warning.code, warning.line]),
    [
      ['badValue', 4],
      ['badValue', 5],
      ['badValue', 6],
      ['unknownKey', 7],
      ['badLine', 8],
    ],
  );
  assert.deepEqual(parseDecisions('---\ncopy: pt-BR\ncheck: normal\n---\n').settings, {
    copy: 'pt-BR',
    check: 'normal',
  });
});

test('the shape of each value', () => {
  assert.equal(isValidSetting('kit', 'acme-figma'), true);
  assert.equal(isValidSetting('kit', '../x'), false);
  assert.equal(isValidSetting('kit', '-a'), false);
  assert.equal(isValidSetting('copy', 'pl'), true);
  assert.equal(isValidSetting('copy', 'pl-pl'), false);
  assert.equal(isValidSetting('check', 'deep'), true);
  assert.equal(isValidSetting('check', 'Deep'), false);
  assert.equal(isOneLine('a decision'), true);
  assert.equal(isOneLine('  '), false);
  assert.equal(isOneLine('two\nlines'), false);
  assert.equal(isOneLine('x'.repeat(301)), false);
});

test('the template reads back with its kit and every heading', () => {
  const parsed = parseDecisions(decisionsTemplate('acme'));
  assert.deepEqual(parsed.settings, { kit: 'acme' });
  assert.deepEqual(parsed.warnings, []);
  for (const section of DECISION_SECTIONS)
    assert.match(parsed.body, new RegExp(`^## ${section}$`, 'm'));
  assert.match(decisionsTemplate(), /shared through git/);
});

test('withDecision adds a dated bullet under the heading and keeps every other byte', () => {
  const hand =
    '---\r\nkit: acme\r\n---\r\n# Mine\r\n\r\n## Kits\r\n- one (2026-01-01)\r\n\r\nfree notes\r\n\r\n' +
    '## Copy\r\n- two (2026-01-02)\r\n  odd indent\t\r\n';
  const next = withDecision(hand, 'Kits', 'three', DAY);
  assert.equal(next, hand.replace('free notes\r\n', `free notes\r\n- three (${DAY})\r\n`));
  const last = withDecision(hand, 'Copy', 'four', DAY);
  assert.equal(last, `${hand}- four (${DAY})\r\n`);
  assert.equal(addDecision(hand, 'Kits', 'three', DAY).line, 10);
});

test('withDecision: an empty section, no newline at the end, and a heading that is missing', () => {
  const made = withDecision(decisionsTemplate(), 'Copy', 'Polish', DAY);
  assert.ok(made.includes(`## Copy\n- Polish (${DAY})\n\n## Layout`));
  assert.equal(
    withDecision('## Other\n- a (2026-01-01)', 'Other', 'b', DAY),
    `## Other\n- a (2026-01-01)\n- b (${DAY})`,
  );
  const missing = addDecision('# T\n\n## Kits\n- a (2026-01-01)\n', 'Layout', 'b', DAY);
  assert.equal(missing.text, `# T\n\n## Kits\n- a (2026-01-01)\n\n## Layout\n- b (${DAY})\n`);
  assert.equal(missing.line, 7);
  assert.equal(withDecision('', 'Kits', 'a', DAY), `## Kits\n- a (${DAY})\n`);
  // A heading inside the front matter block is not a section.
  const block = withDecision('---\nkit: a\n---\n', 'Kits', 'x', DAY);
  assert.equal(block, `---\nkit: a\n---\n\n## Kits\n- x (${DAY})\n`);
});

test('withSetting replaces one line, adds the line, or adds the block', () => {
  assert.equal(
    withSetting('---\nkit: a\ncopy: pl\n---\nbody\n', 'kit', 'b'),
    '---\nkit: b\ncopy: pl\n---\nbody\n',
  );
  assert.equal(
    withSetting('---\ncopy: pl\n---\nbody\n', 'kit', 'b'),
    '---\ncopy: pl\nkit: b\n---\nbody\n',
  );
  assert.equal(withSetting('# T\n', 'check', 'deep'), '---\ncheck: deep\n---\n# T\n');
  assert.equal(withSetting('', 'kit', 'b'), '---\nkit: b\n---\n');
  assert.equal(
    withSetting('﻿---\r\nkit: a\r\n---\r\nx', 'copy', 'pl'),
    '﻿---\r\nkit: a\r\ncopy: pl\r\n---\r\nx',
  );
  // A line that is not valid is replaced when it is the only one; the valid one is kept apart.
  assert.equal(withSetting('---\nkit: A B\n---\n', 'kit', 'b'), '---\nkit: b\n---\n');
  assert.equal(
    withSetting('---\nkit: A B\nkit: a\n---\n', 'kit', 'b'),
    '---\nkit: A B\nkit: b\n---\n',
  );
});

test('replaceDecision swaps one bullet with a new date and keeps every other byte', () => {
  const text =
    '# T\r\n\r\n## Layout\r\n- always 2 columns (2026-01-01)\r\n- keep (2026-01-02)\r\n\r\n' +
    '## Other\r\n- always 2 columns (2026-01-03)\r\n';
  const next = replaceDecision(text, 'Layout', 'always 2 columns', 'always 3 columns', DAY);
  assert.equal(
    next,
    text.replace('- always 2 columns (2026-01-01)', `- always 3 columns (${DAY})`),
  );
  assert.equal(swapDecision(text, 'Layout', 'keep', 'x', DAY)?.line, 5);
  // A bullet with no date matches by its text too.
  assert.equal(
    replaceDecision('## Other\n- bare\n', 'Other', 'bare', 'new', DAY),
    `## Other\n- new (${DAY})\n`,
  );
});

test('replaceDecision is null when the old line is missing, partial, in another section or twice', () => {
  const text =
    '## Layout\n- a (2026-01-01)\n- a (2026-01-02)\n- long text (2026-01-03)\n\n## Other\n- b (2026-01-04)\n';
  assert.equal(replaceDecision(text, 'Layout', 'a', 'c', DAY), null);
  assert.equal(replaceDecision(text, 'Layout', 'long', 'c', DAY), null);
  assert.equal(replaceDecision(text, 'Layout', 'b', 'c', DAY), null);
  assert.equal(replaceDecision(text, 'Copy', 'a', 'c', DAY), null);
  assert.equal(
    replaceDecision(text, 'Layout', 'long text', 'c', DAY)?.includes(`- c (${DAY})`),
    true,
  );
});
