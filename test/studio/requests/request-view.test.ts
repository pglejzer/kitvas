import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addVersion, appendRenames } from '../../../src/drafts/index.ts';
import type { StoredRequest } from '../../../src/studio/requests/request-file.ts';
import { carrierFor, viewOf } from '../../../src/studio/requests/request-view.ts';
import { NOW, shopDraft } from '../../helpers/draft/drafts.ts';

const BUTTON = 'sections/Hero:section/Button';
const MOVED = 'sections/Hero:section/Stack/Button';
const TITLE = 'sections/Hero:section/Text';

function stored(over: Partial<StoredRequest> = {}): StoredRequest {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'say',
    elements: [BUTTON, TITLE],
    stamps: [null, null],
    context: { width: null, state: null },
    text: 'Bigger',
    ops: [],
    note: null,
    version: 1,
    at: NOW.toISOString(),
    status: 'answered',
    takenAt: NOW.toISOString(),
    answer: {
      kind: 'variants',
      variants: [{ label: 'Bold', changes: [{ kind: 'text', id: BUTTON, value: 'Go' }] }],
    },
    answeredAt: NOW.toISOString(),
    answeredVersion: 1,
    ...over,
  };
}

test('a request and its variants follow their elements through the rename logs', () => {
  const { store } = shopDraft();
  // A step before the request does not move it; one after it does.
  appendRenames(store, 'shop', 1, {
    at: '2026-11-22T09:00:00.000Z',
    renames: { [TITLE]: 'sections/Hero:section/Heading' },
    created: [],
  });
  const v2 = addVersion(store, 'shop', NOW).version;
  appendRenames(store, 'shop', v2, {
    at: '2999-01-01T00:00:00.000Z',
    renames: { [BUTTON]: MOVED },
    created: [],
  });
  const view = viewOf(stored(), carrierFor(store, 'shop', v2), false);
  assert.deepEqual(view.elements, [MOVED, TITLE]);
  assert.equal(view.answer?.kind, 'variants');
  if (view.answer?.kind !== 'variants') return;
  assert.equal(view.answer.variants[0]?.changes[0]?.id, MOVED);
  // The view keeps the version it was made on, and none of the file's own fields.
  assert.equal(view.version, 1);
  assert.equal('stamps' in view, false);
  assert.equal('takenAt' in view, false);
});

test('an answer that is no variants, or a request with no rename since, stays as it is', () => {
  const { store } = shopDraft();
  const carry = carrierFor(store, 'shop', 1);
  const done = stored({ answer: { kind: 'done', message: 'Moved it' } });
  assert.deepEqual(viewOf(done, carry, true).answer, { kind: 'done', message: 'Moved it' });
  assert.equal(viewOf(done, carry, true).stale, true);
  const waiting = stored({ status: 'waiting', answer: null, answeredAt: null });
  assert.deepEqual(viewOf(waiting, carry, false).elements, [BUTTON, TITLE]);
  assert.equal(viewOf(waiting, carry, false).answer, null);
});
