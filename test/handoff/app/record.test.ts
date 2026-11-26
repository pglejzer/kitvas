import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRecord, recordSend } from '../../../src/handoff/app/record.ts';
import { HANDOFF_RECORD_FILE } from '../../../src/handoff/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { shopDraft } from '../../helpers/drafts.ts';

const KEY = 'aB3dE5fG7hJ9kL1mN3pQ5r';
const AT = new Date('2026-11-25T10:00:00.000Z');

const figma = (state: 'sent' | 'partial', sendId = 'k7x2m9qa') => ({
  target: 'figma',
  version: 1,
  sendId,
  state,
  lastStep: state === 'partial' ? '30-1280-01.js' : null,
  file: { key: KEY, url: `https://www.figma.com/design/${KEY}/lab` },
  page: 'kitvas · shop',
  frames: [{ width: 1280, node: '12:34' }],
  fontsMissing: [],
});

const code = {
  target: 'code',
  version: 1,
  state: 'done',
  to: 'src/pages/shop',
  scope: 'new',
  files: ['src/pages/shop/Shop.tsx'],
  outside: [],
  scripts: [],
  look: null,
};

function setup() {
  const { store } = shopDraft();
  let at = AT;
  const deps = { drafts: store, now: () => at };
  return {
    store,
    deps,
    later: (minutes: number) => {
      at = new Date(AT.getTime() + minutes * 60_000);
    },
  };
}

function failure(run: () => unknown): KitvasError {
  try {
    run();
  } catch (error) {
    if (error instanceof KitvasError) return error;
    throw error;
  }
  throw new Error('expected a KitvasError');
}

test('a draft with no sends has an empty record', () => {
  const { store } = setup();
  assert.deepEqual(readRecord(store, 'shop'), { schemaVersion: 1, sends: [] });
});

test('a sent result is stamped with the command clock and written beside the draft', () => {
  const { store, deps } = setup();
  const record = recordSend(deps, 'shop', figma('sent'));
  assert.equal(record.sends.length, 1);
  assert.equal(record.sends[0]?.at, '2026-11-25T10:00:00.000Z');
  assert.deepEqual(readRecord(store, 'shop'), record);
  assert.ok(store.exists('shop', HANDOFF_RECORD_FILE));
});

test('a partial send is kept, and a later sent of the same send id replaces it', () => {
  const { deps, later } = setup();
  recordSend(deps, 'shop', figma('partial'));
  later(5);
  const record = recordSend(deps, 'shop', figma('sent'));
  assert.equal(record.sends.length, 1);
  assert.equal(record.sends[0]?.state, 'sent');
  assert.equal(record.sends[0]?.at, '2026-11-25T10:05:00.000Z');
  later(9);
  const other = recordSend(deps, 'shop', figma('sent', 'zz99aa11'));
  assert.equal(other.sends.length, 2);
  assert.equal(other.sends[0]?.target === 'figma' && other.sends[0].sendId, 'zz99aa11');
});

test('a code send needs a brief for its version and sits beside a Figma send', () => {
  const { store, deps } = setup();
  recordSend(deps, 'shop', figma('sent'));
  const refused = failure(() => recordSend(deps, 'shop', code));
  assert.equal(refused.code, 'HANDOFF_NO_BRIEF');
  assert.deepEqual(refused.params, { slug: 'shop', version: 1 });
  store.writeText('shop', 'v1/handoff/code/brief.json', '{}');
  const record = recordSend(deps, 'shop', code);
  assert.deepEqual(
    record.sends.map((send) => send.target),
    ['code', 'figma'],
  );
});

test('a result the schema refuses is HANDOFF_INVALID and writes nothing', () => {
  const { store, deps } = setup();
  const bad = { ...figma('sent'), file: { key: 'short', url: 'https://example.com' } };
  assert.equal(failure(() => recordSend(deps, 'shop', bad)).code, 'HANDOFF_INVALID');
  assert.equal(failure(() => recordSend(deps, 'shop', { at: 'x' })).code, 'HANDOFF_INVALID');
  assert.equal(store.exists('shop', HANDOFF_RECORD_FILE), false);
});

test('a missing draft is DRAFT_NOT_FOUND', () => {
  const { deps } = setup();
  assert.equal(failure(() => recordSend(deps, 'nope', figma('sent'))).code, 'DRAFT_NOT_FOUND');
});

test('a record file the schema refuses is HANDOFF_INVALID', () => {
  const { store } = setup();
  store.writeText('shop', HANDOFF_RECORD_FILE, '{"schemaVersion":2}');
  assert.equal(failure(() => readRecord(store, 'shop')).code, 'HANDOFF_INVALID');
});
