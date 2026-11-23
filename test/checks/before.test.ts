import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEFORE_FILES,
  type Before,
  type Protected,
  problemsOf,
  readBefore,
  reworkBefore,
  type SourceRecord,
  uncappedFindings,
  writeBefore,
} from '../../src/checks/index.ts';
import { createDraft } from '../../src/drafts/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { NOW, TINY, tempDrafts } from '../helpers/drafts.ts';
import { node, page, text, visit } from './rules/facts.ts';

const SOURCE: SourceRecord = {
  schemaVersion: 1,
  source: 'url',
  url: 'https://example.com/',
  files: [],
  capturedAt: NOW.toISOString(),
  widths: [390, 1280],
  measured: true,
};

/** A rework draft `page` and a screen draft `plain`, with no `before/` yet. */
function drafts() {
  const { store } = tempDrafts();
  createDraft(store, {
    slug: 'page',
    title: 'Page',
    kit: TINY,
    now: NOW,
    kind: 'rework',
    rework: { source: 'url' },
  });
  createDraft(store, { slug: 'plain', title: 'Plain', kit: TINY, now: NOW });
  return store;
}

const failsWith =
  (code: string, detail?: RegExp) =>
  (error: unknown): boolean =>
    error instanceof KitvasError &&
    error.code === code &&
    (detail === undefined || detail.test(String(error.params.detail)));

const lorem = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    node({ box: [0, index * 30, 300, 24], text: text(`Lorem ipsum ${index}`) }),
  );

test('what writeBefore writes, readBefore reads back', () => {
  const store = drafts();
  const findings = uncappedFindings([visit(page(lorem(1)))]);
  const before: Before = {
    source: SOURCE,
    inventory: { items: [{ kind: 'price', text: '$1,299.00', width: 390, read: 'measured' }] },
    problems: problemsOf(findings),
    protected: { confirmed: true, items: [{ id: 'price-1', kind: 'price', find: '$1,299.00' }] },
  };
  writeBefore(store, 'page', before);
  assert.deepEqual(readBefore(store, 'page'), before);
  assert.ok(
    (store.readText('page', BEFORE_FILES.source) ?? '').startsWith('{\n  "schemaVersion": 1'),
  );
  assert.deepEqual(reworkBefore(store, 'page'), before);
});

test('a draft with no before/ reads as null; missing parts read as empty or null', () => {
  const store = drafts();
  assert.equal(readBefore(store, 'page'), null);
  writeBefore(store, 'page', { source: { ...SOURCE, measured: false } });
  assert.deepEqual(readBefore(store, 'page'), {
    source: { ...SOURCE, measured: false },
    inventory: { items: [] },
    problems: null,
    protected: null,
  });
});

test('a broken file of before/ is DRAFT_INVALID, and so is a folder without source.json', () => {
  const store = drafts();
  writeBefore(store, 'page', { source: SOURCE });
  store.writeText('page', BEFORE_FILES.problems, '{ not json');
  assert.throws(() => readBefore(store, 'page'), failsWith('DRAFT_INVALID', /problems\.json/));
  store.writeText('page', BEFORE_FILES.problems, '{"counts":{},"findings":[]}\n');
  store.writeText('page', BEFORE_FILES.protected, '{"confirmed":"yes","items":[]}\n');
  assert.throws(
    () => readBefore(store, 'page'),
    failsWith('DRAFT_INVALID', /^before\/protected\.json confirmed: /),
  );

  const empty = drafts();
  empty.makeDir('page', 'before/shots');
  assert.throws(() => readBefore(empty, 'page'), failsWith('DRAFT_INVALID', /source\.json/));
});

test('writeBefore checks every part first: one wrong part writes nothing', () => {
  const store = drafts();
  const wrong: Protected = {
    confirmed: true,
    items: [{ id: 'Not An Id', kind: 'price', find: '$1' }],
  };
  assert.throws(
    () => writeBefore(store, 'page', { source: SOURCE, protected: wrong }),
    failsWith('DRAFT_INVALID', /protected\.json items\.0\.id/),
  );
  assert.equal(store.exists('page', BEFORE_FILES.source), false);
  writeBefore(store, 'page', {});
  assert.equal(store.exists('page', 'before'), false);
});

test('reworkBefore refuses another kind of draft and a rework with no before/', () => {
  const store = drafts();
  assert.throws(() => reworkBefore(store, 'plain'), failsWith('DRAFT_KIND'));
  assert.throws(() => reworkBefore(store, 'page'), failsWith('DRAFT_INVALID', /source\.json/));
  assert.throws(() => reworkBefore(store, 'missing'), failsWith('DRAFT_NOT_FOUND'));
});

test('uncappedFindings keeps every finding of a rule; problemsOf counts them by rule', () => {
  const seven = uncappedFindings([visit(page(lorem(7)))]).filter(
    (finding) => finding.rule === 'ux/placeholder-text',
  );
  assert.equal(seven.length, 7);
  assert.deepEqual(problemsOf(seven).counts, { 'ux/placeholder-text': 7 });
  assert.deepEqual(problemsOf([]), { counts: {}, findings: [] });
  assert.deepEqual(uncappedFindings([]), []);
});
