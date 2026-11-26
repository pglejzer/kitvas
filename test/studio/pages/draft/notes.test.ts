import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Guideline, guidelineFor } from '../../../../src/checks/index.ts';
import type { Translate } from '../../../../src/shared/index.ts';
import {
  checkCounts,
  elementIn,
  guidelineNote,
  notesSection,
} from '../../../../src/studio/pages/draft/notes.ts';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import { finding } from '../../../helpers/findings.ts';
import { t } from '../../../helpers/translate.ts';

/** Names the key it was asked for, so the markup is checked apart from the English texts. */
const keys: Translate = (key) => `[${key}]`;

const ENTRY: Guideline = {
  id: 'ui/example',
  check: 'ui',
  chapter: 'type',
  mode: 'auto',
  severity: 'review',
  basis: 'source',
  thresholds: {},
  sources: [
    { name: 'WCAG <2.2>', url: 'https://www.w3.org/TR/WCAG22/?a=1&b=2' },
    { name: 'NN/g', url: 'https://www.nngroup.com/articles/' },
    { name: 'Not a web page', url: 'javascript:alert(1)' },
  ],
  screens: null,
  key: 'uiExample',
};

const NEXT = { key: 'studio.next.review', params: {} };
const LINK = 'target="_blank" rel="noopener noreferrer"';

test('a guideline note: its sentence, its basis and a link per https source of the book', () => {
  assert.equal(
    guidelineNote(keys, ENTRY).text,
    '<p>[guideline.uiExample.rule]</p><p>[studio.notes.sourced] [studio.notes.sources] ' +
      `<a href="https://www.w3.org/TR/WCAG22/?a=1&amp;b=2" ${LINK}>WCAG &lt;2.2&gt;</a>, ` +
      `<a href="https://www.nngroup.com/articles/" ${LINK}>NN/g</a></p>`,
  );
});

test('a heuristic says so; without sources it has no links', () => {
  const heuristic: Guideline = { ...ENTRY, basis: 'heuristic', sources: [] };
  assert.equal(
    guidelineNote(keys, heuristic).text,
    '<p>[guideline.uiExample.rule]</p><p>[studio.notes.heuristic]</p>',
  );
});

test('the details of a ui finding with a book entry show its guideline after the hint', () => {
  const entry = guidelineFor('ui/line-length');
  assert.ok(entry, 'the book has ui/line-length');
  const shown = [
    finding({ check: 'ui', rule: 'ui/line-length', severity: 'review', hint: 'Narrow it.' }),
  ];
  const text = notesSection({ t, shown, elsewhere: 0, next: NEXT }).text;
  const note = guidelineNote(t, entry).text;
  assert.ok(text.includes(`<p>Narrow it.</p>${note}<p><code>ui/line-length</code>`));
  assert.ok(note.includes(`<p>${escapeHtml(t(`guideline.${entry.key}.rule`))}</p>`));
  const basis = entry.basis === 'source' ? 'studio.notes.sourced' : 'studio.notes.heuristic';
  assert.ok(note.includes(escapeHtml(t(basis))));
  assert.ok(entry.sources.length > 0);
  for (const source of entry.sources) {
    assert.ok(note.includes(`<a href="${escapeHtml(source.url)}" ${LINK}>`), source.url);
  }
});

test('accepted findings are listed apart: no number, never marked, with their reason', () => {
  const open = finding({ rule: 'a11y/label', element: 'Draft:main/Input.0' });
  const accepted = {
    ...finding({ rule: 'ds/raw-color', element: 'Draft:main/Input.1' }),
    reason: 'brand <white>',
  };
  const text = notesSection({
    t: keys,
    shown: [open],
    elsewhere: 0,
    next: NEXT,
    waived: [accepted],
  }).text;
  assert.ok(
    text.includes(
      '<li class="note k-card checks-finding" data-tone="fix" data-rule="a11y/label" ' +
        'data-element="Draft:main/Input.0" data-message=',
    ),
  );
  assert.ok(text.includes('<h2 class="checks-group-title">[studio.notes.accepted]</h2>'));
  assert.ok(
    text.includes(
      '<li class="accepted-note k-card checks-finding" data-rule="ds/raw-color" ' +
        'data-waived-element="Draft:main/Input.1">',
    ),
  );
  // The canvas reads `data-element` of `li.note` for its marks: an accepted row has neither.
  assert.equal(text.split('data-element=').length - 1, 1);
  assert.equal(text.split('class="num checks-num"').length - 1, 1);
  assert.ok(text.includes('<p class="k-meta checks-reason">[studio.notes.reason]</p>'));
  // A script puts each finding's controls in its actions (Restore on a dismissed one).
  assert.equal(text.split('data-checks-actions').length - 1, 2);
});

test('every numbered finding has a Dismiss icon button with its label; a dismissed one has none', () => {
  const shown = [
    finding({ rule: 'a11y/label', element: 'Draft:main/Input.0' }),
    finding({ rule: 'ui/line-length', severity: 'review' }),
  ];
  const dismissed = { ...finding({ rule: 'ds/raw-color' }), reason: 'brand' };
  const text = notesSection({ t, shown, elsewhere: 0, next: NEXT, waived: [dismissed] }).text;
  const button =
    '<button type="button" class="k-icon-btn" data-checks-dismiss-toggle ' +
    'aria-label="Dismiss this finding" title="Dismiss this finding" aria-expanded="false">';
  assert.equal(text.split(button).length - 1, 2);
  // The icon sits at the end of each head, and the row it opens has a slot under each card.
  assert.equal(text.split('<span class="checks-finding-tools" data-checks-tools>').length - 1, 2);
  assert.equal(text.split('data-checks-dismiss></div>').length - 1, 2);
  const [, afterDismissedStart = ''] = text.split('<li class="accepted-note');
  assert.ok(!afterDismissedStart.includes('data-checks-dismiss-toggle'));
  assert.ok(!afterDismissedStart.includes('data-checks-tools'));
  assert.ok(text.includes('<h2 class="checks-group-title">Dismissed (1)</h2>'));
});

test('each finding has its number, its words, and the check and element it comes from', () => {
  const one = finding({ element: 'sections/Pricing:section/Stack/Card.2' });
  const text = notesSection({ t: keys, shown: [one], elsewhere: 0, next: NEXT }).text;
  assert.ok(
    text.includes(
      '<span class="num checks-num" data-tone="fix">1</span><div class="checks-finding-text">' +
        '<span class="checks-finding-title">The phone field has no label.</span>' +
        '<small class="k-meta">[studio.notes.in]</small></div>',
    ),
  );
});

test('the tiles carry each count; one with nothing to show cannot be chosen', () => {
  const shown = [
    finding({ severity: 'fix' }),
    finding({ severity: 'fix', rule: 'a11y/name' }),
    finding({ severity: 'review', rule: 'ui/line-length' }),
  ];
  const run = { canRun: true, ranAt: 1_700_000_000_000, passed: 41 };
  const text = notesSection({ t: keys, shown, elsewhere: 0, next: NEXT, run }).text;
  assert.ok(text.includes('<div class="checks-score" role="group"'));
  assert.ok(text.includes('data-checks-filter="fix" data-count="2" aria-pressed="false">'));
  assert.ok(text.includes('data-checks-filter="review" data-count="1" aria-pressed="false">'));
  assert.ok(text.includes('<b class="checks-tile-count">41</b><span>[studio.notes.passed]</span>'));
  assert.ok(text.includes('data-checks-ran="1700000000000"'));
  assert.ok(text.includes('data-checks-run>[studio.notes.run.again]</button>'));
  // No accepted finding, so no chip for them.
  assert.ok(!text.includes('data-checks-filter="accepted"'));
  // Each group says which filter shows it.
  assert.ok(text.includes('<div class="checks-group" data-checks-group="fix">'));
  assert.ok(text.includes('<div class="checks-group" data-checks-group="review">'));
  assert.ok(!text.includes('data-checks-group="accepted"'));
});

test('the counts: every finding listed, those to fix, those to review, the accepted ones', () => {
  const shown = [finding({ severity: 'fix' }), finding({ severity: 'review' })];
  const waived = [{ ...finding({ rule: 'ds/raw-color' }), reason: 'brand' }];
  assert.deepEqual(checkCounts(shown, waived), { all: 3, fix: 1, review: 1, accepted: 1 });
  assert.deepEqual(checkCounts([], []), { all: 0, fix: 0, review: 0, accepted: 0 });
});

test('nothing listed is one quiet line with the next step under the tiles', () => {
  const text = notesSection({ t: keys, shown: [], elsewhere: 2, next: NEXT }).text;
  assert.ok(text.includes('<div class="k-empty checks-empty">'));
  assert.ok(text.includes('[studio.notes.elsewhere]'));
  assert.ok(text.includes('<p class="checks-next">[studio.next.review]</p>'));
  assert.ok(text.includes('data-checks-filter="fix" data-count="0"'));
});

test('a draft not checked offers the full check, and never a command', () => {
  const next = { key: 'studio.next.check', params: { slug: 'shop' } };
  const run = { canRun: true, ranAt: null, passed: null };
  const text = notesSection({ t, shown: [], elsewhere: 0, next, run }).text;
  assert.ok(text.includes('Not checked yet.'));
  assert.ok(text.includes('data-checks-run>Run the full check</button>'));
  assert.ok(!text.includes('kitvas check'));
  const older = notesSection({ t, shown: [], elsewhere: 0, next }).text;
  assert.ok(!older.includes('data-checks-run'));
  assert.ok(!older.includes('kitvas check'));
});

test('forty findings are all listed and none is cut', () => {
  const shown = Array.from({ length: 40 }, (_, index) =>
    finding({ rule: `a11y/rule-${index}`, element: `sections/Plans:section/Card.${index}` }),
  );
  const text = notesSection({ t: keys, shown, elsewhere: 0, next: NEXT }).text;
  assert.equal(text.split('<li class="note k-card checks-finding"').length - 1, 40);
  assert.equal(text.split('data-checks-evidence').length - 1, 40);
  assert.ok(text.includes('data-checks-filter="fix" data-count="40"'));
});

test('a long message stays in the attribute the script reads, escaped', () => {
  const long = `"${'x'.repeat(400)}" <b>`;
  const text = notesSection({
    t: keys,
    shown: [finding({ message: long, hint: 'a & b' })],
    elsewhere: 0,
    next: NEXT,
  }).text;
  assert.ok(text.includes(`data-message="&quot;${'x'.repeat(400)}&quot; &lt;b&gt;"`));
  assert.ok(text.includes('data-hint="a &amp; b"'));
});

test('the element is named with its section, and the elements helper splits the id', () => {
  assert.deepEqual(elementIn('sections/Pricing:section/Stack/Card.2'), {
    element: 'Card.2',
    section: 'Pricing',
  });
  assert.deepEqual(elementIn('plain'), { element: 'plain', section: '' });
});

test('an accepted finding with no element has no element attribute, and none means no heading', () => {
  const accepted = { ...finding({ rule: 'ds/raw-size', element: null }), reason: 'ok' };
  const withOne = notesSection({
    t: keys,
    shown: [],
    elsewhere: 0,
    next: NEXT,
    waived: [accepted],
  }).text;
  assert.ok(
    withOne.includes(
      '<li class="accepted-note k-card checks-finding" data-rule="ds/raw-size">' +
        '<div class="checks-finding-head">',
    ),
  );
  assert.ok(!withOne.includes('data-waived-element'));
  const none = notesSection({ t: keys, shown: [], elsewhere: 0, next: NEXT }).text;
  assert.ok(!none.includes('accepted'));
  assert.ok(
    !notesSection({ t: keys, shown: [], elsewhere: 0, next: NEXT, waived: [] }).text.includes(
      'accepted',
    ),
  );
});

test('a finding whose rule has no book entry, such as one of axe, shows no guideline', () => {
  const text = notesSection({ t, shown: [finding()], elsewhere: 0, next: NEXT }).text;
  assert.ok(text.includes('<p>Give the Input a label.</p><p><code>a11y/label</code>'));
  assert.ok(!text.includes('noopener'));
});
