import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Guideline, guidelineFor } from '../../../src/checks/index.ts';
import type { Translate } from '../../../src/shared/index.ts';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { guidelineNote, notesSection } from '../../../src/studio/pages/notes.ts';
import { finding } from '../../helpers/findings.ts';
import { t } from '../../helpers/translate.ts';

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

test('a finding whose rule has no book entry, such as one of axe, shows no guideline', () => {
  const text = notesSection({ t, shown: [finding()], elsewhere: 0, next: NEXT }).text;
  assert.ok(text.includes('<p>Give the Input a label.</p><p><code>a11y/label</code>'));
  assert.ok(!text.includes('noopener'));
});
