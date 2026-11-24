import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendRenames,
  idAtStart,
  RENAMES_FILE,
  type RenameStep,
  readRenames,
} from '../../src/drafts/index.ts';
import { shopDraft } from '../helpers/drafts.ts';

const AT = '2026-11-23T09:00:00.000Z';
const STACK = 'sections/Hero:section/Stack';
/** The id of a `Text` in the stack: `text('.2')` is `…/Stack/Text.2`. */
const text = (suffix: string): string => `${STACK}/Text${suffix}`;

const step = (renames: Record<string, string>, created: string[] = []): RenameStep => ({
  at: AT,
  renames,
  created,
});

test('the log appends steps and reads them back oldest first', () => {
  const { store } = shopDraft();
  const first = step({ [text('')]: text('.2'), [text('.2')]: text('') });
  const second = step({}, [`${STACK}/Badge`]);
  appendRenames(store, 'shop', 1, first);
  appendRenames(store, 'shop', 1, second);
  assert.deepEqual(readRenames(store, 'shop', 1), [first, second]);
  assert.equal(RENAMES_FILE, 'edit/renames.json');
  assert.deepEqual(store.readJson('shop', 'v1/edit/renames.json'), {
    schemaVersion: 1,
    steps: [first, second],
  });
  assert.match(store.readText('shop', 'v1/edit/renames.json') ?? '', /\n$/);
});

test('a version without a log has no steps', () => {
  const { store } = shopDraft();
  assert.deepEqual(readRenames(store, 'shop', 1), []);
});

test('each version keeps its own log', () => {
  const { store } = shopDraft();
  appendRenames(store, 'shop', 2, step({ [text('')]: text('.2') }));
  assert.deepEqual(readRenames(store, 'shop', 1), []);
  assert.equal(readRenames(store, 'shop', 2).length, 1);
});

test('a broken log reads as no steps, and the next step starts it again', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/edit/renames.json', '{"schemaVersion": 1, "steps": [');
  assert.deepEqual(readRenames(store, 'shop', 1), []);
  const next = step({}, [`${STACK}/Badge`]);
  appendRenames(store, 'shop', 1, next);
  assert.deepEqual(readRenames(store, 'shop', 1), [next]);
});

test('a log of another shape reads as no steps', () => {
  const { store } = shopDraft();
  for (const raw of [
    [],
    { schemaVersion: 2, steps: [] },
    { schemaVersion: 1, steps: [{ at: AT, renames: { a: 1 }, created: [] }] },
    { schemaVersion: 1, steps: [{ at: AT, renames: {} }] },
    { schemaVersion: 1, steps: [{ at: AT, renames: {}, created: [], by: 'claude' }] },
  ]) {
    store.writeText('shop', 'v1/edit/renames.json', JSON.stringify(raw));
    assert.deepEqual(readRenames(store, 'shop', 1), [], JSON.stringify(raw));
  }
});

test('idAtStart follows an element back through two moves', () => {
  // Start: One, Two, Three. Three moved first, then moved after One: One, Three, Two.
  const steps = [
    step({ [text('')]: text('.2'), [text('.2')]: text('.3'), [text('.3')]: text('') }),
    step({ [text('')]: text('.2'), [text('.2')]: text('') }),
  ];
  assert.equal(idAtStart(steps, text('')), text(''));
  assert.equal(idAtStart(steps, text('.2')), text('.3'));
  assert.equal(idAtStart(steps, text('.3')), text('.2'));
});

test('idAtStart keeps an id no step touched', () => {
  assert.equal(idAtStart([], text('.2')), text('.2'));
  assert.equal(idAtStart([step({ [text('')]: text('.2') })], `${STACK}/Card`), `${STACK}/Card`);
});

test('an element a step created has no id at the start, even after a later move', () => {
  const created = step({}, [`${STACK}/Badge`]);
  assert.equal(idAtStart([created], `${STACK}/Badge`), null);
  const moved = step({ [`${STACK}/Badge`]: `${STACK}/Card/Badge` });
  assert.equal(idAtStart([created, moved], `${STACK}/Card/Badge`), null);
});

test('an id a step gave away and no element got came from outside the log', () => {
  // The first Text was removed and the second took its id; a new `Text.2` came later from Claude.
  const removed = step({ [text('.2')]: text('') });
  assert.equal(idAtStart([removed], text('.2')), null);
  assert.equal(idAtStart([removed], text('')), text('.2'));
});
