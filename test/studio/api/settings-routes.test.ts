import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KitvasError } from '../../../src/shared/errors/errors.ts';
import {
  DEFAULT_VIEW,
  memoryViewStore,
  type ViewSettings,
  type ViewStore,
} from '../../../src/shared/settings/config.ts';
import type { Studio } from '../../../src/studio/index.ts';
import { call, pageCookie, shopStudio } from '../../helpers/studio/studio.ts';

const PATH = '/api/v1/settings/view';
const DARK: ViewSettings = { theme: 'dark', panels: 'flush', accent: 'teal' };

function post(studio: Studio, body: unknown, headers: Record<string, string> = {}) {
  return call(studio.port, {
    method: 'POST',
    path: PATH,
    headers: {
      authorization: `Bearer ${studio.token}`,
      origin: studio.url,
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const read = (studio: Studio) =>
  call(studio.port, { path: PATH, headers: { authorization: `Bearer ${studio.token}` } });

test('the view starts as the default, and a saved one is read back', async () => {
  const view = memoryViewStore();
  const { studio } = await shopStudio({}, { view });
  try {
    const first = await read(studio);
    assert.equal(first.status, 200);
    assert.deepEqual(JSON.parse(first.text), DEFAULT_VIEW);
    const saved = await post(studio, DARK);
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse(saved.text), DARK);
    assert.deepEqual(view.read(), DARK);
    assert.deepEqual(JSON.parse((await read(studio)).text), DARK);
  } finally {
    await studio.close();
  }
});

test('the next page a person opens shows the saved view', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const before = await call(studio.port, { path: '/', headers: { cookie } });
    assert.ok(before.text.includes('<html lang="en" data-panels="cards" data-accent="copper">'));
    await post(studio, DARK);
    const after = await call(studio.port, { path: '/', headers: { cookie } });
    assert.ok(
      after.text.includes(
        '<html lang="en" data-theme="dark" data-panels="flush" data-accent="teal">',
      ),
    );
    const kit = await call(studio.port, { path: '/kit', headers: { cookie } });
    assert.ok(kit.text.includes('data-theme="dark"'));
  } finally {
    await studio.close();
  }
});

test('a page of the studio saves with its cookie; another site and no caller at all cannot', async () => {
  const { studio } = await shopStudio();
  try {
    const cookie = await pageCookie(studio);
    const own = await call(studio.port, {
      method: 'POST',
      path: PATH,
      headers: { cookie, origin: studio.url, 'content-type': 'application/json' },
      body: JSON.stringify(DARK),
    });
    assert.equal(own.status, 200);
    const foreign = await post(studio, DEFAULT_VIEW, { origin: 'http://evil.example' });
    assert.equal(foreign.status, 403);
    const nobody = await call(studio.port, {
      method: 'POST',
      path: PATH,
      headers: { origin: studio.url, 'content-type': 'application/json' },
      body: JSON.stringify(DEFAULT_VIEW),
    });
    assert.equal(nobody.status, 401);
    assert.deepEqual(JSON.parse((await read(studio)).text), DARK);
  } finally {
    await studio.close();
  }
});

test('an unknown word, a missing setting or an extra field is refused and nothing is saved', async () => {
  const view = memoryViewStore();
  const { studio } = await shopStudio({}, { view });
  try {
    const bad: unknown[] = [
      { ...DARK, accent: 'blue' },
      { ...DARK, theme: 'sepia' },
      { theme: 'dark', panels: 'flush' },
      { ...DARK, font: 'Comic Sans' },
      { ...DARK, accent: '"><script>' },
      'dark',
      null,
    ];
    for (const body of bad) {
      const answer = await post(studio, body);
      assert.equal(answer.status, 422, JSON.stringify(body));
    }
    assert.deepEqual(view.read(), DEFAULT_VIEW);
  } finally {
    await studio.close();
  }
});

test('a settings file that cannot be written says so, and the page keeps working', async () => {
  const broken: ViewStore = {
    read: () => DEFAULT_VIEW,
    write: () => {
      throw new KitvasError('CONFIG_INVALID', { path: '~/.kitvas/config.json', detail: 'x' });
    },
  };
  const { studio, errors } = await shopStudio({}, { view: broken });
  try {
    const answer = await post(studio, DARK);
    assert.equal(answer.status, 422);
    assert.equal((JSON.parse(answer.text) as { code?: string }).code, 'CONFIG_INVALID');
    assert.equal(errors.length, 0);
    const cookie = await pageCookie(studio);
    assert.equal((await call(studio.port, { path: '/', headers: { cookie } })).status, 200);
  } finally {
    await studio.close();
  }
});
