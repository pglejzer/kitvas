import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasBreakpoint,
  needsBuild,
  ORIGINAL_MAX,
  originalIssue,
  originalMarks,
  originalPage,
  scanStyles,
  scopedCss,
  sheetCss,
} from '../../../src/checks/domain/kit/original-page.ts';

const FRAME = 'body { margin: 0; padding: 16px; }';
const BUTTON =
  '<acme-button data-kv-scope="Button"><button type="button" class="btn">Save</button></acme-button>';

test('a plain fragment is accepted, with a relative address and a data address', () => {
  assert.equal(originalIssue(BUTTON), undefined);
  assert.equal(originalIssue('<img src="src/assets/logo.svg" alt="">'), undefined);
  assert.equal(originalIssue('<img src="data:image/svg+xml,%3Csvg/%3E" alt="">'), undefined);
  assert.equal(
    originalIssue('<header class="top"><p>Visit https://acme.test</p></header>'),
    undefined,
  );
  assert.equal(originalIssue('<base-button><meta-data></meta-data></base-button>'), undefined);
});

test('each thing an original may not hold is refused by name', () => {
  const refused: [string, string][] = [
    ['<!DOCTYPE html><p>x</p>', 'it holds a doctype'],
    ['<div><script>alert(1)</script></div>', 'it holds a <script> tag'],
    ['<div><STYLE>p{}</STYLE></div>', 'it holds a <style> tag'],
    ['<div><link rel="stylesheet" href="a.css"></div>', 'it holds a <link> tag'],
    ['<div><iframe src="a.html"></iframe></div>', 'it holds a <iframe> tag'],
    ['<html><p>x</p></html>', 'it holds a <html> tag'],
    ['<div><base href="/"></div>', 'it holds a <base> tag'],
    ['<button onclick="go()">x</button>', 'it holds the attribute "onclick"'],
    ['<img src="a.png" alt="" onError=x>', 'it holds the attribute "onerror"'],
    ['<a href="javascript:go()">x</a>', 'it holds a javascript: address'],
    ['<img src="https://acme.test/a.png" alt="">', 'it holds an outside address'],
    ['<img src=//acme.test/a.png alt="">', 'it holds an outside address'],
    ['<div style="background: url(http://acme.test/a.png)">x</div>', 'it holds an outside address'],
    ['Save', 'it does not start with an element'],
    [`<p>${'x'.repeat(ORIGINAL_MAX)}</p>`, `it is over ${ORIGINAL_MAX} characters`],
  ];
  for (const [markup, reason] of refused) assert.equal(originalIssue(markup), reason, markup);
});

test('the marks of an original, each once, in order', () => {
  const card = `<div data-kv-scope="Card">${BUTTON}${BUTTON}<i data-kv-scope='Icon'></i></div>`;
  assert.deepEqual(originalMarks(card), ['Card', 'Button', 'Icon']);
  assert.deepEqual(originalMarks('<p>none</p>'), []);
});

test('a scoped style starts at the parent of the marked root and reads :host as that root', () => {
  const css = ':host { display: inline-flex; }\n:host(.wide:not(.x)) .btn { width: 100%; }';
  assert.equal(
    scopedCss(css, 'Button'),
    [
      '@scope (:has(> [data-kv-scope="Button"])) to (:scope > :not([data-kv-scope="Button"]), [data-kv-scope="Button"] [data-kv-scope] > *) {',
      '[data-kv-scope="Button"] { display: inline-flex; }',
      '[data-kv-scope="Button"]:is(.wide:not(.x)) .btn { width: 100%; }',
      '}',
      '',
    ].join('\n'),
  );
});

test('a selector that depends on what is around the component is left unreadable', () => {
  const scoped = scopedCss(':host-context(.dark) .btn { color: white; }', 'Button');
  assert.ok(scoped.includes(':kv-unread-context(.dark) .btn'));
  assert.deepEqual(scanStyles(scoped).selectors, [':kv-unread-context(.dark) .btn']);
});

test('the page holds the styles in order, the frame rule last, and the markup in the root', () => {
  const page = originalPage({
    markup: BUTTON,
    styles: [
      { css: 'body { color: red; }', scope: undefined },
      { css: '.btn { color: blue; }', scope: 'Button' },
    ],
    base: 'file:///C:/work/shop/',
    frame: FRAME,
    shell: undefined,
  });
  const order = [
    '<base href="file:///C:/work/shop/">',
    'body { color: red; }',
    '@scope (:has(> [data-kv-scope="Button"]))',
    '.btn { color: blue; }',
    FRAME,
    `<div id="root">${BUTTON}</div>`,
  ].map((part) => page.indexOf(part));
  assert.ok(order.every((at) => at !== -1));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.ok(page.startsWith('<!doctype html>'));
});

test('a style text cannot close its own tag', () => {
  const page = originalPage({
    markup: '<p>x</p>',
    styles: [{ css: '.a::after { content: "</style><p>y</p>"; }', scope: undefined }],
    base: 'file:///p/',
    frame: FRAME,
    shell: undefined,
  });
  assert.equal(page.includes('</style><p>y</p>'), false);
});

test('the app shell stands around the root, and no wrapper takes the id root', () => {
  const page = originalPage({
    markup: BUTTON,
    styles: [],
    base: 'file:///p/',
    frame: FRAME,
    shell: {
      html: { class: 'dark', lang: 'pl' },
      body: { class: 'app "wide"' },
      wrappers: [
        { tag: 'div', attributes: { id: 'root', class: 'layout' } },
        { tag: 'acme-shell', attributes: { 'data-density': 'compact' } },
      ],
    },
  });
  assert.ok(page.includes('<html lang="pl" class="dark">'));
  assert.ok(page.includes('<body class="app &quot;wide&quot;">'));
  assert.ok(
    page.includes(
      [
        '<div class="layout">',
        '<acme-shell data-density="compact">',
        `<div id="root">${BUTTON}</div>`,
        '</acme-shell>',
        '</div>',
        '</body>',
      ].join('\n'),
    ),
  );
  assert.equal(page.split('id="root"').length, 2);
});

test('a page without a shell is a plain page', () => {
  const page = originalPage({
    markup: BUTTON,
    styles: [],
    base: 'file:///p/',
    frame: FRAME,
    shell: undefined,
  });
  assert.ok(page.includes('<html lang="en">'));
  assert.ok(page.includes(`<body>\n<div id="root">${BUTTON}</div>\n</body>`));
});

test('a sheet is the style as the page holds it', () => {
  assert.equal(sheetCss({ css: '.a { color: red; }', scope: undefined }), '.a { color: red; }');
  assert.equal(
    sheetCss({ css: '.a { color: red; }', scope: 'Card' }),
    scopedCss('.a { color: red; }', 'Card'),
  );
});

test('the scan reads selectors, declarations and at-rules', () => {
  const scan = scanStyles(
    [
      '@use-not-css "x";',
      '/* .hidden { color: red; } */',
      '.btn,\n.btn--quiet:hover { padding: 8px  16px; --own: { a: b }; color: #1f5fd0 !important; }',
      '.a::after { content: "} {"; }',
      '@media (max-width: 600px) { .card { padding: 12px; } }',
      '@keyframes spin { from { rotate: 0deg; } to { rotate: 360deg; } }',
      '@font-face { font-family: Acme; src: url(a.woff2); }',
      '.nest { > .child { gap: 4px; } &:hover { gap: 8px; } }',
    ].join('\n'),
  );
  assert.deepEqual(scan.selectors, [
    '.btn',
    '.btn--quiet:hover',
    '.a::after',
    '.card',
    '.nest',
    '& > .child',
    '&:hover',
  ]);
  assert.deepEqual(scan.declarations, [
    ['padding', '8px 16px'],
    ['color', '#1f5fd0'],
    ['content', '"} {"'],
    ['padding', '12px'],
    ['gap', '4px'],
    ['gap', '8px'],
  ]);
  assert.deepEqual(scan.atRules, ['use-not-css', 'media', 'keyframes', 'font-face']);
});

test('only what the project build would change is reported', () => {
  const scan = scanStyles(
    '@tailwind base;\n@import "x.css";\n@media print { .a { color: red; } }\n@-moz-document url-prefix() { .a { color: red; } }',
  );
  assert.deepEqual(
    needsBuild(scan, [
      '::ng-deep .x',
      'button::-moz-focus-inner',
      ':-moz-focusring',
      // Chromium reads it in a sheet, yet says no to it in `CSS.supports(selector())`.
      '.field::-webkit-outer-spin-button',
      'display: -ms-flexbox',
      '-moz-appearance: none',
      'color: theme("colors.red")',
      '.video-o-matic:deep(.x)',
    ]),
    [
      '@tailwind',
      '@import',
      '::ng-deep .x',
      'color: theme("colors.red")',
      '.video-o-matic:deep(.x)',
    ],
  );
  assert.deepEqual(needsBuild(scanStyles('.a { color: red; }'), []), []);
  // A sheet from the network: no build makes it readable, and both pages are drawn offline.
  const remote =
    "@import url('https://fonts.example.com/a.css');\n@import '//cdn.example.com/b.css';";
  assert.deepEqual(needsBuild(scanStyles(`${remote}\n.a { color: red; }`), []), []);
});

test('a declaration every browser drops is no build step: the app drops it too', () => {
  const scan = scanStyles(
    '.a { cursor: hand; *zoom: 1; color: v-bind(tone); width: $gap; margin: @gap; composes: b; }',
  );
  assert.deepEqual(
    needsBuild(scan, [
      'cursor: hand',
      '*zoom: 1',
      'color: v-bind(tone)',
      'width: $gap',
      'margin: @gap',
      'composes: b',
    ]),
    ['color: v-bind(tone)', 'width: $gap', 'margin: @gap', 'composes: b'],
  );
});

test('a breakpoint is a width condition of the page or of a container', () => {
  assert.equal(hasBreakpoint('@media (max-width: 600px) { .a { color: red; } }'), true);
  assert.equal(hasBreakpoint('@media (width >= 40rem) { .a { color: red; } }'), true);
  assert.equal(hasBreakpoint('@container (min-inline-size: 300px) { .a { color: red; } }'), true);
  assert.equal(hasBreakpoint('@media (prefers-color-scheme: dark) { .a { color: red; } }'), false);
  assert.equal(hasBreakpoint('.a { max-width: 600px; }'), false);
});
