import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agoOf, byChange, groupByKit, startChoices } from '../../../src/studio/views/start.ts';

/** Local time, so the calendar-day rule reads the same in any zone the tests run in. */
const NOW = new Date(2026, 10, 25, 15, 0, 0);
const before = (ms: number): Date => new Date(NOW.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('under a minute is just now, and a time in the future is too', () => {
  assert.deepEqual(agoOf(before(59 * SECOND), NOW), { key: 'studio.start.ago.now' });
  assert.deepEqual(agoOf(before(-5 * MINUTE), NOW), { key: 'studio.start.ago.now' });
});

test('minutes: one minute is singular, under an hour counts them', () => {
  assert.deepEqual(agoOf(before(MINUTE), NOW), {
    key: 'studio.start.ago.minute',
    params: { count: 1 },
  });
  assert.deepEqual(agoOf(before(12 * MINUTE), NOW), {
    key: 'studio.start.ago.minutes',
    params: { count: 12 },
  });
  assert.deepEqual(agoOf(before(HOUR - SECOND), NOW), {
    key: 'studio.start.ago.minutes',
    params: { count: 59 },
  });
});

test('hours: one hour is singular, under a day counts them', () => {
  assert.deepEqual(agoOf(before(HOUR), NOW), {
    key: 'studio.start.ago.hour',
    params: { count: 1 },
  });
  assert.deepEqual(agoOf(before(23 * HOUR), NOW), {
    key: 'studio.start.ago.hours',
    params: { count: 23 },
  });
});

test('the calendar day before is yesterday, then days up to a week', () => {
  assert.deepEqual(agoOf(before(DAY), NOW), { key: 'studio.start.ago.yesterday' });
  assert.deepEqual(agoOf(new Date(2026, 10, 24, 0, 5), NOW), { key: 'studio.start.ago.yesterday' });
  assert.deepEqual(agoOf(new Date(2026, 10, 23, 18, 0), NOW), {
    key: 'studio.start.ago.days',
    params: { count: 2 },
  });
  assert.deepEqual(agoOf(before(6 * DAY), NOW), {
    key: 'studio.start.ago.days',
    params: { count: 6 },
  });
});

test('a week to two is last week, then weeks up to 60 days, then the date', () => {
  assert.deepEqual(agoOf(before(7 * DAY), NOW), { key: 'studio.start.ago.lastWeek' });
  assert.deepEqual(agoOf(before(14 * DAY - SECOND), NOW), { key: 'studio.start.ago.lastWeek' });
  assert.deepEqual(agoOf(before(14 * DAY), NOW), {
    key: 'studio.start.ago.weeks',
    params: { count: 2 },
  });
  assert.deepEqual(agoOf(before(59 * DAY), NOW), {
    key: 'studio.start.ago.weeks',
    params: { count: 8 },
  });
  assert.deepEqual(agoOf(new Date(2026, 8, 5, 9, 30), NOW), {
    key: 'studio.start.ago.date',
    params: { date: '2026-09-05' },
  });
});

test('the start switch has five choices, and Edit names the draft changed last', () => {
  const choices = startChoices('shop');
  assert.deepEqual(
    choices.map((choice) => choice.id),
    ['compose', 'rework', 'craft', 'learn', 'edit'],
  );
  assert.equal(choices[0]?.command, '/kitvas:compose a pricing page with three plans');
  assert.equal(choices[1]?.command, '/kitvas:rework https://your-app.example/billing');
  assert.equal(choices[4]?.command, '/kitvas:edit shop');
});

test('with no draft the start switch has no Edit', () => {
  const ids = startChoices(null).map((choice) => choice.id);
  assert.deepEqual(ids, ['compose', 'rework', 'craft', 'learn']);
});

test('the newest change comes first, and an entry with no time last, by slug', () => {
  const items = [
    { slug: 'zeta', changed: null },
    { slug: 'old', changed: new Date(2026, 0, 1) },
    { slug: 'alpha', changed: null },
    { slug: 'new', changed: new Date(2026, 5, 1) },
    { slug: 'twin-b', changed: new Date(2026, 3, 1) },
    { slug: 'twin-a', changed: new Date(2026, 3, 1) },
  ];
  assert.deepEqual(
    byChange(items).map((item) => item.slug),
    ['new', 'twin-a', 'twin-b', 'old', 'alpha', 'zeta'],
  );
  assert.equal(items[0]?.slug, 'zeta', 'the list given is left as it was');
});

type Item = { slug: string; kitId: string | null; changed: Date | null };
const item = (slug: string, kitId: string | null, changed: Date | null): Item => ({
  slug,
  kitId,
  changed,
});
const idsOf = (items: Item[], project: string): (string | null)[] =>
  groupByKit(items, project).map((group) => group.id);

test('the project kit comes first, then the groups by their latest change', () => {
  const items = [
    item('a', 'mui', new Date(2026, 5, 1)),
    item('b', 'tiny', new Date(2026, 0, 1)),
    item('c', 'ant', new Date(2026, 8, 1)),
    item('d', 'mui', new Date(2026, 6, 1)),
  ];
  assert.deepEqual(idsOf(items, 'tiny'), ['tiny', 'ant', 'mui']);
  assert.deepEqual(idsOf(items, 'base'), ['ant', 'mui', 'tiny']);
});

test('a group keeps the order of its cards and counts the latest change of any of them', () => {
  const items = [
    item('first', 'mui', new Date(2026, 1, 1)),
    item('second', 'mui', new Date(2026, 4, 1)),
    item('third', 'mui', null),
  ];
  const groups = groupByKit(items, 'tiny');
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]?.items.map((entry) => entry.slug),
    ['first', 'second', 'third'],
  );
  assert.deepEqual(groups[0]?.changed, new Date(2026, 4, 1));
});

test('a kit that is not in the project still has its group, and one kit makes one group', () => {
  const gone = groupByKit([item('x', 'ghost', new Date(2026, 1, 1))], 'tiny');
  assert.deepEqual(
    gone.map((group) => group.id),
    ['ghost'],
  );
  assert.equal(groupByKit([], 'tiny').length, 0);
});

test('drafts that cannot be read are the last group, and a group with no time follows the dated', () => {
  const items = [
    item('bad', null, null),
    item('undated-b', 'zed', null),
    item('undated-a', 'abc', null),
    item('dated', 'mui', new Date(2026, 1, 1)),
  ];
  assert.deepEqual(idsOf(items, 'tiny'), ['mui', 'abc', 'zed', null]);
  assert.equal(items[0]?.slug, 'bad', 'the list given is left as it was');
});
