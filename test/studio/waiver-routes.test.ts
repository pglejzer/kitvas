import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addVersion, appendRenames } from '../../src/drafts/index.ts';
import { NOW, shopDraft } from '../helpers/drafts.ts';
import { call, studioOver, writeFakeBuild } from '../helpers/studio.ts';

type Problem = { code: string };
type Listed = {
  waivers: { rule: string; element: string | null; reason: string; version: number; at: string }[];
};

const json = <T>(text: string): T => JSON.parse(text) as T;

const OLD = 'sections/Hero:section/Button';
const RENAMED = 'sections/Hero:section/Stack/Button';
const WAIVERS = '/api/v1/drafts/shop/waivers';

async function waiverStudio() {
  const { store } = shopDraft();
  writeFakeBuild(store);
  const { studio, errors } = await studioOver(store, {}, { now: () => NOW });
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const get = (path: string) => call(studio.port, { path, headers: auth });
  const post = (path: string, body: unknown, headers: Record<string, string> = write) =>
    call(studio.port, { method: 'POST', path, headers, body: JSON.stringify(body) });
  return { store, studio, errors, auth, get, post };
}

const accept = (reason: string, element: string | null = OLD, rule = 'a11y/color-contrast') => ({
  rule,
  element,
  reason,
});

test('a draft has no waivers until one is accepted', async () => {
  const { studio, errors, get } = await waiverStudio();
  try {
    const answer = await get(WAIVERS);
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(json<Listed>(answer.text), { waivers: [] });
    const missing = await get('/api/v1/drafts/nope/waivers');
    assert.equal(missing.status, 404);
    assert.equal(json<Problem>(missing.text).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('accepting a finding stores it with its version and date, and it can be withdrawn', async () => {
  const { studio, errors, get, post } = await waiverStudio();
  try {
    const answer = await post(WAIVERS, accept('  our brand colour  '));
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(json<Listed>(answer.text).waivers, [
      {
        rule: 'a11y/color-contrast',
        element: OLD,
        reason: 'our brand colour',
        version: 1,
        at: NOW.toISOString(),
      },
    ]);
    assert.equal(json<Listed>((await get(WAIVERS)).text).waivers.length, 1);
    const gone = await post(`${WAIVERS}/withdraw`, { rule: 'a11y/color-contrast', element: OLD });
    assert.equal(gone.status, 200, gone.text);
    assert.deepEqual(json<Listed>(gone.text), { waivers: [] });
    assert.deepEqual(json<Listed>((await get(WAIVERS)).text), { waivers: [] });
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a reason is required and has at most 300 characters', async () => {
  const { studio, errors, post } = await waiverStudio();
  try {
    for (const reason of ['', '   ', 'x'.repeat(301)]) {
      const answer = await post(WAIVERS, accept(reason));
      assert.equal(answer.status, 422, reason);
      assert.equal(json<Problem>(answer.text).code, 'BODY_INVALID');
    }
    const longest = await post(WAIVERS, accept('x'.repeat(300)));
    assert.equal(longest.status, 200, longest.text);
    // A rule that is no rule id, an id that is no element id, or a field that is not one.
    assert.equal((await post(WAIVERS, accept('ok', OLD, 'nope'))).status, 422);
    assert.equal((await post(WAIVERS, accept('ok', '../../x'))).status, 422);
    assert.equal((await post(WAIVERS, { ...accept('ok'), extra: 1 })).status, 422);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the waiver routes need the write checks and a draft that exists', async () => {
  const { studio, errors, auth, post } = await waiverStudio();
  try {
    const noOrigin = { ...auth, 'content-type': 'application/json' };
    assert.equal((await post(WAIVERS, accept('ok'), noOrigin)).status, 403);
    assert.equal((await post(`${WAIVERS}/withdraw`, accept('ok'), noOrigin)).status, 403);
    const missing = await post('/api/v1/drafts/nope/waivers', accept('ok'));
    assert.equal(missing.status, 404);
    assert.equal(json<Problem>(missing.text).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a waiver follows its element through the rename log into the next version', async () => {
  const { store, studio, errors, get, post } = await waiverStudio();
  try {
    await post(WAIVERS, accept('brand'));
    await post(WAIVERS, accept('no element', null, 'ds/raw-color'));
    const v2 = addVersion(store, 'shop', NOW).version;
    appendRenames(store, 'shop', v2, {
      at: '2999-01-01T00:00:00.000Z',
      renames: { [OLD]: RENAMED },
      created: [],
    });
    const listed = json<Listed>((await get(WAIVERS)).text).waivers;
    assert.deepEqual(
      listed.map((one) => [one.rule, one.element, one.version]),
      [
        ['a11y/color-contrast', RENAMED, 1],
        ['ds/raw-color', null, 1],
      ],
    );
    // Withdrawn by the id the latest version gives it.
    const gone = await post(`${WAIVERS}/withdraw`, {
      rule: 'a11y/color-contrast',
      element: RENAMED,
    });
    assert.deepEqual(
      json<Listed>(gone.text).waivers.map((one) => one.rule),
      ['ds/raw-color'],
    );
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});
