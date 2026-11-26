import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestVersion, parseDraft, serializeJson } from '../../../src/drafts/domain/draft.ts';
import { isSlug, pascalCase, SECTION_ID, versionFolder } from '../../../src/drafts/domain/names.ts';
import { DEFAULT_STATES, statesIssues } from '../../../src/drafts/domain/states.ts';
import { KitvasError } from '../../../src/shared/index.ts';

const RAW = {
  schemaVersion: 1,
  slug: 'rent-a-bike',
  title: 'Rent a bike',
  kind: 'screen',
  kit: { id: 'base', version: '1.0.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 2, createdAt: '2026-11-22T11:00:00.000Z' },
  ],
};

test('slugs, section ids and names', () => {
  assert.equal(isSlug('rent-a-bike'), true);
  assert.equal(isSlug('Rent'), false);
  assert.equal(isSlug('../x'), false);
  assert.equal(isSlug(''), false);
  assert.equal(SECTION_ID.test('order-summary'), true);
  assert.equal(SECTION_ID.test('step-2'), true);
  assert.equal(SECTION_ID.test('2-step'), false);
  assert.equal(SECTION_ID.test('Order'), false);
  assert.equal(SECTION_ID.test('order--summary'), false);
  assert.equal(pascalCase('order-summary'), 'OrderSummary');
  assert.equal(pascalCase('hero'), 'Hero');
  assert.equal(versionFolder(3), 'v3');
});

test('parses draft.json and finds the latest version', () => {
  const draft = parseDraft(RAW, 'rent-a-bike');
  assert.equal(draft.title, 'Rent a bike');
  assert.equal(latestVersion(draft), 2);
  assert.equal(serializeJson({ a: 1 }), '{\n  "a": 1\n}\n');
});

test('a draft.json that fails the schema is DRAFT_INVALID with the place', () => {
  for (const change of [
    { extra: true },
    { kind: 'page' },
    { versions: [] },
    { slug: 'Bad Slug' },
  ]) {
    assert.throws(
      () => parseDraft({ ...RAW, ...change }, 'rent-a-bike'),
      (error: unknown) =>
        error instanceof KitvasError &&
        error.code === 'DRAFT_INVALID' &&
        error.params.slug === 'rent-a-bike' &&
        String(error.params.detail).length > 0,
    );
  }
});

test('states: the default file is valid; problems are issues', () => {
  assert.deepEqual(statesIssues(DEFAULT_STATES), []);
  assert.deepEqual(
    statesIssues(undefined).map((issue) => issue.key),
    ['draftIssue.statesInvalid'],
  );
  assert.deepEqual(
    statesIssues({ schemaVersion: 1, default: 'x', states: [] }).map((issue) => issue.key),
    ['draftIssue.statesInvalid'],
  );
  // The studio's frame channel takes ids of at most 63 characters (client/channel/protocol.ts).
  const states = (id: string) => ({ schemaVersion: 1, default: id, states: [{ id, label: 'A' }] });
  assert.deepEqual(statesIssues(states(`a${'b'.repeat(62)}`)), []);
  assert.deepEqual(
    statesIssues(states(`a${'b'.repeat(63)}`)).map((issue) => issue.key),
    ['draftIssue.statesInvalid'],
  );
  assert.deepEqual(
    statesIssues({
      schemaVersion: 1,
      default: 'empty',
      states: [{ id: 'filled', label: 'With data' }],
    }),
    [{ path: 'states.default', key: 'draftIssue.statesDefault', params: { id: 'empty' } }],
  );
});
