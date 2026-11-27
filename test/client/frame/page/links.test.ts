import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leadsOut, type Pressed } from '../../../../client/frame/page/links.ts';

const PAGE =
  'http://kitvas.localhost:5174/f/key/shop/v1/html/index.html?state=filled&live=2#kitvas=abc&studio=5173';

/** An element inside a link with `href`, or one inside no link (`null`). */
const inLink = (href: string | null): Pressed => ({
  closest: () => (href === null ? null : { getAttribute: () => href }),
});

test('a link to another page leads out of the prototype', () => {
  for (const href of [
    '/customers',
    'plans',
    '../reports/index.html',
    '?tab=2',
    'https://example.com/',
    'mailto:maya@example.com',
  ]) {
    assert.equal(leadsOut(inLink(href), PAGE), true, href);
  }
});

test('a link to a place on the same page does not', () => {
  for (const href of ['#accounts', '#', '', PAGE, PAGE.replace(/#.*$/, '#top')]) {
    assert.equal(leadsOut(inLink(href), PAGE), false, href);
  }
});

test('a press outside a link, or on an address that cannot be read, leads nowhere', () => {
  assert.equal(leadsOut(inLink(null), PAGE), false);
  assert.equal(leadsOut(inLink('http://['), PAGE), false);
});
