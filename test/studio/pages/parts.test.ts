import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studioPortOf, withChannel } from '../../../src/studio/pages/draft/frame-channel.ts';
import { frameSrc } from '../../../src/studio/pages/draft/frame-src.ts';
import { notesSection } from '../../../src/studio/pages/draft/notes.ts';
import { html } from '../../../src/studio/pages/html.ts';
import { lockedPage } from '../../../src/studio/pages/locked.ts';
import { page } from '../../../src/studio/pages/shell.ts';
import { finding } from '../../helpers/studio/findings.ts';
import { t } from '../../helpers/translate.ts';

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
  assert.ok(text.includes('<a class="k-btn" href="/" aria-current="page">Drafts</a>'));
  const other = page({
    title: 'Shop',
    nonce: 'N',
    skin: '',
    nav: { t, current: null },
    body: html``,
  });
  assert.ok(other.includes('<a class="k-btn" href="/">Drafts</a>'));
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
  assert.ok(text.includes('<h2 class="checks-group-title">1 to fix</h2>'));
  assert.ok(text.includes('<h2 class="checks-group-title">2 to review</h2>'));
  const row = (tone: string, rule: string, rest: string): string =>
    `<li class="note k-card checks-finding" data-tone="${tone}" data-rule="${rule}"${rest} data-message=`;
  assert.ok(text.includes(row('fix', 'a11y/label', ' data-element="Draft:main/Input.0"')));
  assert.ok(text.includes(row('review', 'ds/raw-color', ' data-element="Draft:main/Input.0"')));
  // A finding without an element leaves the attribute out, and names no element.
  assert.ok(text.includes(row('review', 'runtime/console', '')));
  const head = (tone: string, n: number, title: string, meta: string): string =>
    `<span class="num checks-num" data-tone="${tone}">${n}</span><div class="checks-finding-text">` +
    `<span class="checks-finding-title">${title}</span><small class="k-meta">${meta}</small>`;
  assert.ok(text.includes(head('fix', 1, 'The phone field has no label.', 'Input.0 in Draft')));
  assert.ok(text.includes(head('review', 3, 'The console shows an error.', 'Runtime')));
  // The tiles count what each shows; the accepted ones have a chip only when there are any.
  assert.ok(text.includes('data-checks-filter="fix" data-count="1" aria-pressed="false"'));
  assert.ok(text.includes('data-checks-filter="review" data-count="2" aria-pressed="false"'));
  assert.ok(!text.includes('data-checks-filter="accepted"'));
  assert.ok(text.includes('<p><code>a11y/label</code> src/tsx/Draft.tsx, line 12</p>'));
  assert.ok(text.includes('<p><code>ds/raw-color</code> src/scss/Draft.scss</p>'));
  assert.ok(text.includes('<p><code>runtime/console</code></p>'));
  assert.ok(text.includes('2 more in other widths or states.'));
  assert.ok(text.includes(`<p class="k-meta checks-next">${t('studio.next.review')}</p>`));
});

test('with nothing to show, only the next step is there', () => {
  const next = { key: 'studio.next.good', params: { next: 2 } };
  const text = notesSection({ t, shown: [], elsewhere: 0, next }).text;
  assert.ok(!text.includes('<h2'));
  assert.ok(!text.includes('more in other'));
  assert.ok(text.includes('ask Claude for version 2.'));
});
