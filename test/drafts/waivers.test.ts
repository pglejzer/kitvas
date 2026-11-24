import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptWaiver,
  addVersion,
  appendRenames,
  carried,
  followRenames,
  MAX_WAIVERS,
  parseWaivers,
  readWaivers,
  stepsAfter,
  waiversFor,
  withdrawWaiver,
} from '../../src/drafts/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { shopDraft } from '../helpers/drafts.ts';

const T1 = new Date('2026-11-24T10:00:00.000Z');
const T2 = new Date('2026-11-24T11:00:00.000Z');
const OLD = 'sections/Hero:section/Button';
const RENAMED = 'sections/Hero:section/Stack/Button';

const waiver = (element: string | null, version = 1, at = T1.toISOString()) => ({
  rule: 'a11y/color-contrast',
  element,
  reason: 'brand colour',
  version,
  at,
});

test('a draft with no waivers file has none, and a broken file has none either', () => {
  const { store } = shopDraft();
  assert.deepEqual(readWaivers(store, 'shop'), []);
  store.writeText('shop', 'waivers.json', '{ not json');
  assert.deepEqual(readWaivers(store, 'shop'), []);
  store.writeText('shop', 'waivers.json', '{"schemaVersion":2,"waivers":[]}');
  assert.deepEqual(readWaivers(store, 'shop'), []);
});

test('accepting a finding keeps the rule, element, reason, version and date', () => {
  const { store } = shopDraft();
  const kept = acceptWaiver(
    store,
    'shop',
    { rule: 'a11y/color-contrast', element: OLD, reason: '  brand colour  ' },
    T1,
  );
  assert.deepEqual(kept, [waiver(OLD)]);
  assert.deepEqual(readWaivers(store, 'shop'), [waiver(OLD)]);
  // The file is the one the schema describes: two spaces and a final newline.
  const written = store.readText('shop', 'waivers.json') ?? '';
  assert.ok(written.endsWith('}\n'));
  assert.equal(parseWaivers(JSON.parse(written)).length, 1);
});

test('accepting the same finding again replaces the first waiver', () => {
  const { store } = shopDraft();
  const key = { rule: 'a11y/color-contrast', element: OLD };
  acceptWaiver(store, 'shop', { ...key, reason: 'first' }, T1);
  const kept = acceptWaiver(store, 'shop', { ...key, reason: 'second' }, T2);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.reason, 'second');
  assert.equal(kept[0]?.at, T2.toISOString());
});

test('a finding with no element is a waiver of its own, apart from one with an element', () => {
  const { store } = shopDraft();
  acceptWaiver(store, 'shop', { rule: 'ds/raw-color', element: null, reason: 'a' }, T1);
  acceptWaiver(store, 'shop', { rule: 'ds/raw-color', element: OLD, reason: 'b' }, T1);
  assert.equal(readWaivers(store, 'shop').length, 2);
  const left = withdrawWaiver(store, 'shop', { rule: 'ds/raw-color', element: null });
  assert.deepEqual(
    left.map((one) => one.element),
    [OLD],
  );
});

test('withdrawing a waiver that is not there changes nothing and writes nothing', () => {
  const { store } = shopDraft();
  assert.deepEqual(withdrawWaiver(store, 'shop', { rule: 'ds/raw-color', element: null }), []);
  assert.equal(store.exists('shop', 'waivers.json'), false);
});

test('a full file refuses one more waiver, but takes a replacement', () => {
  const { store } = shopDraft();
  const many = Array.from({ length: MAX_WAIVERS }, (_, index) => ({
    ...waiver(`sections/Hero:section/p.${index}`),
  }));
  store.writeText('shop', 'waivers.json', JSON.stringify({ schemaVersion: 1, waivers: many }));
  assert.throws(
    () =>
      acceptWaiver(store, 'shop', { rule: 'a11y/color-contrast', element: OLD, reason: 'x' }, T1),
    (error) => error instanceof KitvasError && error.code === 'WAIVER_LIMIT',
  );
  const replaced = acceptWaiver(
    store,
    'shop',
    { rule: 'a11y/color-contrast', element: 'sections/Hero:section/p.0', reason: 'again' },
    T2,
  );
  assert.equal(replaced.length, MAX_WAIVERS);
});

test('renames follow in order, and an id no step names stays', () => {
  const steps = [
    { at: 'a', renames: { [OLD]: 'x:1' } },
    { at: 'b', renames: { 'x:1': RENAMED } },
  ];
  assert.equal(followRenames(OLD, steps), RENAMED);
  assert.equal(followRenames('other:1', steps), 'other:1');
  // Two ids that trade places each go to the other once.
  const swap = [{ at: 'a', renames: { 'p:1': 'p:2', 'p:2': 'p:1' } }];
  assert.equal(followRenames('p:1', swap), 'p:2');
  assert.equal(followRenames('p:2', swap), 'p:1');
});

test('only the steps after a waiver count in its own version, and all of the later ones', () => {
  const stored = waiver(OLD, 1, '2026-11-24T10:30:00.000Z');
  const log: Record<number, { at: string; renames: Record<string, string> }[]> = {
    1: [
      { at: '2026-11-24T10:00:00.000Z', renames: { 'early:1': 'early:2' } },
      { at: '2026-11-24T11:00:00.000Z', renames: { [OLD]: 'mid:1' } },
    ],
    2: [{ at: '2026-11-24T12:00:00.000Z', renames: { 'mid:1': RENAMED } }],
    3: [{ at: '2026-11-24T13:00:00.000Z', renames: { [RENAMED]: 'late:1' } }],
  };
  const stepsOf = (version: number) => log[version] ?? [];
  assert.equal(stepsAfter(stored, 1, stepsOf).length, 1);
  assert.equal(stepsAfter(stored, 2, stepsOf).length, 2);
  assert.equal(carried(stored, 1, stepsOf).element, 'mid:1');
  assert.equal(carried(stored, 2, stepsOf).element, RENAMED);
  assert.equal(carried(stored, 3, stepsOf).element, 'late:1');
  // The step before the waiver does not touch an id the waiver did not have.
  assert.equal(
    carried(waiver('early:1', 1, '2026-11-24T10:30:00.000Z'), 1, stepsOf).element,
    'early:1',
  );
  // A waiver made on a later version than the one asked about is not carried back.
  assert.equal(carried(waiver(OLD, 3), 2, stepsOf).element, OLD);
});

test('a waiver follows the rename log to the next version while its element exists', () => {
  const { store } = shopDraft();
  acceptWaiver(store, 'shop', { rule: 'a11y/color-contrast', element: OLD, reason: 'brand' }, T1);
  const v2 = addVersion(store, 'shop', T2).version;
  appendRenames(store, 'shop', v2, {
    at: '2026-11-24T12:00:00.000Z',
    renames: { [OLD]: RENAMED },
    created: [],
  });
  const now = waiversFor(store, 'shop', v2);
  assert.deepEqual(
    now.map((one) => [one.element, one.version]),
    [[RENAMED, 1]],
  );
  // It carries only while the element is one the version has.
  assert.deepEqual(
    waiversFor(store, 'shop', v2, (id) => id === RENAMED).map((one) => one.element),
    [RENAMED],
  );
  assert.deepEqual(
    waiversFor(store, 'shop', v2, (id) => id === OLD),
    [],
  );
  // The version it was made on still names the old id.
  assert.deepEqual(
    waiversFor(store, 'shop', 1).map((one) => one.element),
    [OLD],
  );
});

test('a waiver is withdrawn by the id the latest version gives its element', () => {
  const { store } = shopDraft();
  acceptWaiver(store, 'shop', { rule: 'a11y/color-contrast', element: OLD, reason: 'brand' }, T1);
  const v2 = addVersion(store, 'shop', T2).version;
  appendRenames(store, 'shop', v2, {
    at: '2026-11-24T12:00:00.000Z',
    renames: { [OLD]: RENAMED },
    created: [],
  });
  const left = withdrawWaiver(store, 'shop', { rule: 'a11y/color-contrast', element: RENAMED });
  assert.deepEqual(left, []);
  assert.deepEqual(readWaivers(store, 'shop'), []);
});

test('a waiver without an element ignores the rename log and the existence test', () => {
  const { store } = shopDraft();
  acceptWaiver(store, 'shop', { rule: 'ds/raw-color', element: null, reason: 'brand' }, T1);
  const v2 = addVersion(store, 'shop', T2).version;
  assert.equal(waiversFor(store, 'shop', v2, () => false).length, 1);
});
