import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAsked,
  itemsOf,
  parseWhy,
  type WhyReport,
  whyRequestOf,
} from '../../../../../client/studio/edit/why/entries.ts';

const section = (name: string, stale = false) => ({
  section: name,
  element: `sections/${name}:section`,
  lines: ['One line.'],
  guidelines: ['ui-type-scale'],
  stale,
});

test('the answer of the route is read, and anything else is refused', () => {
  const report = { sections: [section('Hero')], missing: ['Footer'] };
  assert.deepEqual(parseWhy(report), report);
  assert.equal(parseWhy(null), null);
  assert.equal(parseWhy({ sections: 'no', missing: [] }), null);
  assert.equal(parseWhy({ sections: [{ ...section('Hero'), lines: [1] }], missing: [] }), null);
  assert.equal(parseWhy({ sections: [{ ...section('Hero'), stale: 'yes' }], missing: [] }), null);
  assert.equal(parseWhy({ sections: [], missing: [3] }), null);
});

test('entries follow the layout, written and missing sections together', () => {
  const report: WhyReport = {
    sections: [section('Hero'), section('Footer')],
    missing: ['OrderSummary'],
  };
  const items = itemsOf(report, [], ['hero', 'order-summary', 'footer']);
  assert.deepEqual(
    items.map((item) => [item.section, item.state]),
    [
      ['Hero', 'written'],
      ['OrderSummary', 'missing'],
      ['Footer', 'written'],
    ],
  );
});

test('a section the layout does not name goes last, in the order the server gave', () => {
  const report: WhyReport = { sections: [section('B'), section('A')], missing: [] };
  const items = itemsOf(report, [], ['hero']);
  assert.deepEqual(
    items.map((item) => item.section),
    ['B', 'A'],
  );
});

test('a missing section with a waiting or taken why request is asked, not missing', () => {
  const report: WhyReport = { sections: [], missing: ['Hero', 'Footer', 'Nav'] };
  const requests = [
    { kind: 'why', status: 'waiting', text: 'Hero' },
    { kind: 'why', status: 'answered', text: 'Footer' },
    { kind: 'say', status: 'waiting', text: 'Nav' },
  ];
  const states = itemsOf(report, requests, []).map((item) => item.state);
  assert.deepEqual(states, ['asked', 'missing', 'missing']);
  assert.equal(isAsked(requests, 'Hero'), true);
  assert.equal(isAsked(requests, 'Footer'), false);
});

test('a stale section keeps its flag and its lines', () => {
  const report: WhyReport = { sections: [section('Hero', true)], missing: [] };
  const [item] = itemsOf(report, [], []);
  assert.equal(item?.stale, true);
  assert.deepEqual(item?.lines, ['One line.']);
});

test('a why request names the section as its text and its root as the element', () => {
  assert.deepEqual(whyRequestOf({ section: 'Hero', element: 'sections/Hero:section' }), {
    kind: 'why',
    elements: ['sections/Hero:section'],
    context: { width: null, state: null, option: null },
    text: 'Hero',
  });
  assert.deepEqual(whyRequestOf({ section: 'Hero', element: null }).elements, []);
});
