import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterRow, optionRow } from '../../../src/studio/pages/controls.ts';
import { studioPortOf, withChannel } from '../../../src/studio/pages/draft/frame-channel.ts';
import { frameSrc } from '../../../src/studio/pages/draft/frame-src.ts';
import { notesSection } from '../../../src/studio/pages/draft/notes.ts';
import { html } from '../../../src/studio/pages/html.ts';
import { lockedPage } from '../../../src/studio/pages/locked.ts';
import { page } from '../../../src/studio/pages/shell.ts';
import { finding } from '../../helpers/findings.ts';
import { t } from '../../helpers/translate.ts';

test('options are plain links; the current one says so', () => {
  const options = [
    { label: 'Phone', href: '/drafts/shop?width=390', current: true },
    { label: 'Tablet', href: '/drafts/shop?a=1&b=2', current: false },
  ];
  assert.equal(
    optionRow('Width', options).text,
    '<p class="row"><span class="label">Width</span>' +
      '<a class="opt" href="/drafts/shop?width=390" aria-current="true">Phone</a>' +
      '<a class="opt" href="/drafts/shop?a=1&amp;b=2">Tablet</a></p>',
  );
  assert.equal(
    filterRow('Which drafts', options.slice(0, 1)).text,
    '<nav class="row" aria-label="Which drafts">' +
      '<a class="opt" href="/drafts/shop?width=390" aria-current="true">Phone</a></nav>',
  );
});

test('a state option carries its id; other options carry no data attribute', () => {
  const text = optionRow('Show', [
    { label: 'Empty', href: '/d?state=empty', current: true, state: 'empty' },
    { label: 'Full', href: '/d?state=full', current: false, state: 'full' },
    { label: 'Phone', href: '/d?width=390', current: false },
  ]).text;
  assert.ok(
    text.includes('<a class="opt" data-state="empty" href="/d?state=empty" aria-current="true">'),
  );
  assert.ok(text.includes('<a class="opt" data-state="full" href="/d?state=full">Full</a>'));
  assert.ok(text.includes('<a class="opt" href="/d?width=390">Phone</a>'));
});

test('the channel ends the frame address with the studio port taken from the host', () => {
  assert.equal(
    withChannel(
      'http://localhost:5001/f/k/shop/v1/html/index.html?state=a',
      'chan',
      'localhost:5000',
    ),
    'http://localhost:5001/f/k/shop/v1/html/index.html?state=a#kitvas=chan&studio=5000',
  );
  assert.equal(studioPortOf('127.0.0.1:49152'), '49152');
});

test('the frame address uses the host name of the request', () => {
  const target = { slug: 'shop', version: 2, state: 'empty' };
  assert.equal(
    frameSrc({ port: 5001, key: 'k3y' }, 'localhost:5000', target),
    'http://localhost:5001/f/k3y/shop/v2/html/index.html?state=empty',
  );
});

test('a page carries the skin on its nonce, and the studio links unless it is locked', () => {
  const nav = { t, current: 'drafts' as const };
  const text = page({
    title: 'Drafts',
    nonce: 'N0nce',
    skin: 'body{}',
    nav,
    body: html`<main></main>`,
  });
  assert.ok(text.includes('<style nonce="N0nce">body{}</style>'));
  assert.ok(text.includes('<title>Drafts - kitvas</title>'));
  assert.ok(text.includes('<a class="opt" href="/" aria-current="page">Drafts</a>'));
  const other = page({
    title: 'Shop',
    nonce: 'N',
    skin: '',
    nav: { t, current: null },
    body: html``,
  });
  assert.ok(other.includes('<a class="opt" href="/">Drafts</a>'));
  const locked = lockedPage({ t, nonce: 'N', skin: 'body{}', reason: 'closed' });
  assert.ok(!locked.includes('<nav'));
  assert.ok(locked.includes('<h1>Open the studio from its link</h1>'));
  assert.ok(locked.includes('<style nonce="N">body{}</style>'));
});

test('findings are numbered across both groups, with their check and their details', () => {
  const shown = [
    finding(),
    finding({
      severity: 'review',
      check: 'ds',
      rule: 'ds/raw-color',
      file: 'src/scss/Draft.scss',
      line: 0,
      message: 'The total colour is typed by hand.',
      hint: 'Use the kit token.',
    }),
    finding({
      severity: 'review',
      check: 'runtime',
      rule: 'runtime/console',
      file: null,
      element: null,
      message: 'The console shows an error.',
      hint: 'Open the console.',
    }),
  ];
  const next = { key: 'studio.next.review', params: {} };
  const text = notesSection({ t, shown, elsewhere: 2, next }).text;
  assert.ok(text.includes('<h2 class="fix">1 to fix</h2>'));
  assert.ok(text.includes('<h2 class="review">2 to review</h2>'));
  assert.ok(text.includes('<li class="note" data-tone="fix" data-element="Draft:main/Input.0">'));
  // A finding without an element leaves the attribute out.
  assert.ok(
    text.includes('<li class="note" data-tone="review" data-element="Draft:main/Input.0">'),
  );
  assert.ok(text.includes('<li class="note" data-tone="review"><span class="num">3</span>'));
  assert.ok(
    text.includes(
      '<span class="num">1</span><div>The phone field has no label.<small>Accessibility</small>',
    ),
  );
  assert.ok(
    text.includes(
      '<span class="num">3</span><div>The console shows an error.<small>Runtime</small>',
    ),
  );
  assert.ok(text.includes('<p><code>a11y/label</code> src/tsx/Draft.tsx, line 12</p>'));
  assert.ok(text.includes('<p><code>ds/raw-color</code> src/scss/Draft.scss</p>'));
  assert.ok(text.includes('<p><code>runtime/console</code></p>'));
  assert.ok(text.includes('2 more in other widths or states.'));
  assert.ok(text.includes(`<p class="next">${t('studio.next.review')}</p>`));
});

test('with nothing to show, only the next step is there', () => {
  const next = { key: 'studio.next.good', params: { next: 2 } };
  const text = notesSection({ t, shown: [], elsewhere: 0, next }).text;
  assert.ok(!text.includes('<h2'));
  assert.ok(!text.includes('more in other'));
  assert.ok(text.includes('ask Claude for version 2.'));
});
