import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_LONGHANDS,
  parseLiveFrame,
  parseLiveStudio,
} from '../../../client/channel/live-protocol.ts';

const CHANNEL = 'c1';
const ID = 'sections/Plans:Stack/Card/Button';

test('the page forces a state, asks for measurements, the card and the held properties', () => {
  assert.deepEqual(parseLiveStudio({ type: 'force', ids: [ID], state: 'hover' }, CHANNEL), {
    kitvas: 1,
    channel: CHANNEL,
    type: 'force',
    ids: [ID],
    state: 'hover',
  });
  assert.ok(parseLiveStudio({ type: 'force', ids: [], state: null }, CHANNEL));
  assert.equal(parseLiveStudio({ type: 'force', ids: [ID], state: 'visited' }, CHANNEL), undefined);
  const expect = [{ id: ID, property: 'gap', value: '8px' }];
  assert.ok(parseLiveStudio({ type: 'measure-live', request: 1, ids: [ID], expect }, CHANNEL));
  assert.ok(parseLiveStudio({ type: 'a11y', request: 2, id: ID }, CHANNEL));
  assert.ok(parseLiveStudio({ type: 'state-held', request: 3, id: ID }, CHANNEL));
  assert.equal(parseLiveStudio({ type: 'state-held', request: -1, id: ID }, CHANNEL), undefined);
  const marks = [{ id: ID, label: 'L1', tone: 'fix' }];
  assert.ok(parseLiveStudio({ type: 'live-marks', marks }, CHANNEL));
  const long = [{ id: ID, label: 'L123456789', tone: 'fix' }];
  assert.equal(parseLiveStudio({ type: 'live-marks', marks: long }, CHANNEL), undefined);
});

test('a frame answers the held longhands of the state it forces, within the limits', () => {
  const answer = {
    type: 'state-held',
    request: 3,
    id: ID,
    state: 'hover',
    longhands: ['background-color', 'border-top-color'],
  };
  assert.deepEqual(parseLiveFrame(answer, CHANNEL), { kitvas: 1, channel: CHANNEL, ...answer });
  assert.ok(parseLiveFrame({ ...answer, state: null, longhands: [] }, CHANNEL));
  assert.equal(parseLiveFrame({ ...answer, longhands: ['Not A Property'] }, CHANNEL), undefined);
  const many = Array.from({ length: MAX_LONGHANDS + 1 }, () => 'color');
  assert.equal(parseLiveFrame({ ...answer, longhands: many }, CHANNEL), undefined);
  assert.equal(parseLiveFrame({ ...answer, state: 'focus-visible' }, CHANNEL), undefined);
});

test('live facts and the accessibility card are checked for their shape', () => {
  const fact = { id: ID, rule: 'contrast', severity: 'fix', values: { ratio: 3.2, needed: 4.5 } };
  assert.ok(parseLiveFrame({ type: 'live-facts', request: 1, width: 768, facts: [fact] }, CHANNEL));
  const bad = { ...fact, rule: 'made-up' };
  assert.equal(
    parseLiveFrame({ type: 'live-facts', request: 1, width: 768, facts: [bad] }, CHANNEL),
    undefined,
  );
  assert.ok(parseLiveFrame({ type: 'a11y-card', request: 2, id: ID, card: null }, CHANNEL));
});
