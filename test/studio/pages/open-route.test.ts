import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { openRoute } from '../../../src/studio/pages/open-route.ts';
import { createOpenLinks } from '../../../src/studio/security/open-links.ts';
import { t } from '../../helpers/translate.ts';

function setup() {
  const links = createOpenLinks(() => new Date('2026-11-22T10:00:00.000Z'));
  const route = openRoute({ links, t, port: 5000, pageSecret: 's'.repeat(43), skin: 'body{}' });
  const open = (query: string) =>
    route.handle({
      params: {},
      headers: {},
      query: new URLSearchParams(query),
      host: '127.0.0.1:5000',
      nonce: 'n0nce',
    });
  return { links, route, open };
}

test('a fresh code sets the page cookie and goes to the page', async () => {
  const { links, route, open } = setup();
  assert.equal(route.policy, 'open');
  const { code } = links.issue();
  const answer = await open(`code=${code}&to=%2Fdrafts%2Fshop`);
  assert.ok(typeof answer !== 'string');
  assert.equal(answer.status, 303);
  assert.equal(answer.headers?.location, '/drafts/shop');
  assert.equal(
    answer.headers?.['set-cookie'],
    `kitvas_5000=${'s'.repeat(43)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict`,
  );
});

test('an unknown place leads home; a used or missing code gets the locked page', async () => {
  const { links, open } = setup();
  const { code } = links.issue();
  const answer = await open(`code=${code}&to=//evil.example`);
  assert.ok(typeof answer !== 'string');
  assert.equal(answer.headers?.location, '/');
  for (const query of [`code=${code}`, '']) {
    const locked = await open(query);
    assert.ok(typeof locked !== 'string');
    assert.equal(locked.status, 401);
    assert.equal(locked.headers, undefined);
    assert.ok(locked.body.includes(escapeHtml(t('studio.page.locked.used'))));
    assert.ok(locked.body.includes('nonce="n0nce"'));
    assert.ok(locked.body.includes('>body{}</style>'));
  }
});
