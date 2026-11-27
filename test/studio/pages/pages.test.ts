import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChecksFile } from '../../../src/checks/index.ts';
import {
  addVersion,
  createDraft,
  type DraftStore,
  serializeJson,
} from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { escapeHtml, html } from '../../../src/studio/pages/html.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { checksOf, finding } from '../../helpers/studio/findings.ts';
import { t } from '../../helpers/translate.ts';

type Ask = { params?: Record<string, string>; query?: string; host?: string };

function pages(store: DraftStore) {
  const routes = pageRoutes({
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'kitvas-ui',
  });
  return async (id: string, ask: Ask = {}): Promise<string> => {
    const route = routes.find((candidate) => candidate.id === id);
    assert.ok(route, id);
    const answer = await route.handle({
      params: ask.params ?? {},
      headers: {},
      query: new URLSearchParams(ask.query ?? ''),
      host: ask.host ?? '127.0.0.1:5000',
      nonce: 'N0nce',
    });
    assert.equal(typeof answer, 'string', 'these pages answer with HTML');
    return answer as string;
  };
}

const build = (store: DraftStore, slug = 'shop', version = 1): void =>
  store.writeText(slug, `v${version}/build/html/index.html`, '<!doctype html>');

const check = (store: DraftStore, file: ChecksFile): void =>
  store.writeText(file.slug, `v${file.version}/build/json/checks.json`, serializeJson(file));

const SHOP = { params: { slug: 'shop' } };

/** The markup between the opening tag that starts with `open` and its matching `</tag>`. */
function region(text: string, open: string, tag: string): string {
  const start = text.indexOf(open);
  assert.ok(start >= 0, open);
  let depth = 0;
  for (const match of text.slice(start).matchAll(new RegExp(`<(/?)${tag}\\b`, 'g'))) {
    depth += match[1] === '/' ? -1 : 1;
    if (depth === 0) return text.slice(start, text.indexOf('>', start + match.index) + 1);
  }
  assert.fail(`${open} is not closed`);
}

const COMPARE_ICON =
  '<svg class="k-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="#i-compare"></use></svg>';

/** The Edit button of the bar's mode switch, as its opening tag. */
const editMode = (text: string): string =>
  /<button type="button" data-shell-mode="edit"[^>]*>/.exec(text)?.[0] ?? '';

/** A finding's head in the Checks pane: its number in its tone, its words, its check and element. */
const numbered = (tone: string, n: number, title: string, meta?: string): string =>
  `<span class="num checks-num" data-tone="${tone}">${n}</span><div class="checks-finding-text">` +
  `<span class="checks-finding-title">${title}</span>` +
  (meta === undefined ? '' : `<small class="k-meta">${meta}</small>`);

/** The end of a frame address in a page's HTML: a 22-character channel and the studio port. */
const HASH_5000 = '#kitvas=[A-Za-z0-9_-]{22}&amp;studio=5000';

/** The editor's panel on `main`: the inline layout script names the attribute in its code too. */
const EDIT_PANEL = /<main\b[^>]*\bdata-edit-panel/;

test('values are escaped, HTML from html is kept, lists are joined', () => {
  const name = `<b>"Tom" & 'Jerry'</b>`;
  assert.equal(
    html`<p>${name}</p>`.text,
    '<p>&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;</p>',
  );
  const items = ['a', 'b'].map((item) => html`<li>${item}</li>`);
  assert.equal(html`<ul>${items}</ul>`.text, '<ul><li>a</li><li>b</li></ul>');
  assert.equal(html`${null}${undefined}${false}${0}`.text, '0');
  assert.equal(escapeHtml('a<b'), 'a&lt;b');
});

test('a draft not built yet says how to build it, and Edit says why it is off', async () => {
  const { store } = shopDraft();
  const text = await pages(store)('draft', SHOP);
  assert.ok(text.includes('<h1 class="bar-title k-clip" title="Shop">Shop</h1>'));
  // The canvas says what is missing and holds the one command that makes it.
  const missing = escapeHtml(t('studio.draft.notBuilt', { version: 1 }));
  assert.ok(
    text.includes(
      `<div class="k-empty stage-empty"><p>${missing}</p><div class="k-cmd"><code>kitvas build shop</code>`,
    ),
  );
  assert.ok(text.includes(escapeHtml(t('studio.next.build', { slug: 'shop' }))));
  assert.ok(!text.includes('<iframe'));
  assert.ok(!text.includes('Built from'));
  const reason = escapeHtml(t('studio.edit.shell.reason.unbuilt'));
  assert.ok(editMode(text).endsWith(`aria-pressed="false" disabled title="${reason}">`));
  assert.doesNotMatch(text, EDIT_PANEL);
  assert.ok(!text.includes('data-edit-undo'));
  // The editor's panes say so too, and the screen's texts are there for its own script.
  assert.ok(
    text.includes(
      `<div class="k-empty pane-empty"><p>${reason}</p><div class="k-cmd"><code>kitvas build shop</code>`,
    ),
  );
  assert.ok(text.includes('<script type="application/json" id="edit-texts" nonce="N0nce">'));
});

test('a built draft is framed at the phone width in its default state', async () => {
  const { store } = shopDraft();
  build(store);
  const text = await pages(store)('draft', { ...SHOP, host: 'localhost:5000' });
  assert.match(
    text,
    new RegExp(
      `<iframe src="http://localhost:5001/f/k3y/shop/v1/html/index\\.html\\?state=filled${HASH_5000}" width="390" sandbox="allow-scripts"`,
    ),
  );
  assert.ok(!text.includes('allow-same-origin'));
  assert.match(
    text,
    /^<!doctype html>[\s\S]*<main class="draft-page side-screen" data-draft="shop"/m,
  );
  // The latest built version can be edited; the screen opens in Preview.
  assert.ok(
    text.includes(
      '<main class="draft-page side-screen" data-draft="shop" data-version="1" data-state="filled" data-width="390" data-mode="preview" data-edit-panel>',
    ),
  );
  assert.ok(text.includes('<script type="module" src="/assets/draft.js"></script></main>'));
  // The panels' first layout is set before the first paint: the script comes after both panels
  // and their grips, and before the module script that would otherwise fix the page afterwards.
  const opening = text.indexOf('<script nonce="N0nce">(function(){try{var D=document');
  assert.ok(opening > text.indexOf('<aside class="k-island side-panel" data-side="right"'));
  assert.ok(opening > text.indexOf('<div class="side-grip" data-grip="right"'));
  assert.ok(opening < text.indexOf('src="/assets/draft.js"'));
  assert.ok(text.includes("'kitvas.editor.layout'"));
  assert.ok(!text.includes('data-compare'));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(text.includes('<div class="checks-lines"><p>Built from the Tiny kit.</p></div>'));
  // Not checked: the pane says so and offers the full check; no command to copy.
  assert.ok(text.includes(escapeHtml(t('studio.notes.notChecked'))));
  assert.ok(text.includes('data-checks-run>'));
  assert.ok(!text.includes(escapeHtml(t('studio.next.check', { slug: 'shop' }))));
});

test('the screen has a full window of its own: no studio links, no edit toggle', async () => {
  const { store } = shopDraft();
  build(store);
  const text = await pages(store)('draft', SHOP);
  assert.ok(text.includes('<body class="screen">'));
  assert.ok(!text.includes('<header class="top">'));
  assert.ok(text.includes('data-paused-view'));
  const gone = ['data-edit-toggle', 'class="controls"', 'class="edit-panel"', 'class="draft"'];
  for (const part of gone) assert.ok(!text.includes(part), part);
});

test('the top bar has three parts: the draft, the mode, and the session', async () => {
  const { store } = shopDraft();
  build(store);
  const text = await pages(store)('draft', SHOP);
  const bar = region(text, '<header class="k-bar bar-editor">', 'header');
  const start = region(bar, '<div class="k-bar-start">', 'div');
  // The mark is a link home, then Drafts / title.
  assert.ok(
    start.startsWith(
      '<div class="k-bar-start"><a class="k-logo-link" href="/"><svg class="k-logo" viewBox="0 0 34 34"',
    ),
  );
  assert.ok(start.includes('</svg></a><a class="k-btn bar-crumb" href="/">'));
  assert.ok(start.includes('<h1 class="bar-title k-clip" title="Shop">Shop</h1>'));
  assert.ok(start.includes('<details class="bar-menu" data-shell="version">'));
  const modes = region(bar, '<div class="k-seg bar-modes" role="group"', 'div');
  assert.ok(
    modes.includes(
      `<button type="button" data-shell-mode="preview" aria-pressed="true">${t('studio.edit.shell.preview')}</button>`,
    ),
  );
  assert.ok(editMode(modes).endsWith('data-shell-mode="edit" aria-pressed="false">'));
  const end = region(bar, '<div class="k-bar-end">', 'div');
  for (const part of [
    'data-bar-listening',
    'data-edit-session',
    'data-edit-undo disabled',
    'data-edit-redo disabled',
  ]) {
    assert.ok(end.includes(part), part);
  }
  assert.ok(end.includes('data-edit-save disabled'));
  assert.ok(end.includes('data-edit-unsave hidden'));
  assert.ok(end.includes('data-shell="shortcuts"'));
  // In Preview the end holds the findings, the notes and Compare; each opens its pane.
  assert.ok(end.includes('data-bar-findings data-open-pane="checks"'));
  assert.ok(end.includes('data-bar-notes data-open-pane="notes"'));
  assert.ok(end.includes('data-shell="compare"'));
  assert.ok(bar.indexOf('k-bar-start') < bar.indexOf('k-bar-mid'));
  assert.ok(bar.indexOf('k-bar-mid') < bar.indexOf('k-bar-end'));
});

test('both panels have their tabs and panes, a grip and a rail; Preview shows Checks', async () => {
  const { store } = shopDraft();
  build(store);
  const text = await pages(store)('draft', SHOP);
  const body = region(text, '<div class="side-body">', 'div');
  // The rail names the left panel's panes; the panel starts folded, so none is pressed.
  const rail = region(body, '<nav class="k-island rail-nav"', 'nav');
  for (const pane of ['layers', 'insert', 'why', 'notes']) {
    assert.ok(
      rail.includes(
        `data-rail-tab="${pane}" id="editor-rail-${pane}" aria-controls="editor-pane-${pane}" aria-pressed="false"`,
      ),
      pane,
    );
  }
  assert.ok(
    rail.includes('data-fold="left" aria-controls="editor-side-left" aria-expanded="false"'),
  );
  const left = region(body, '<aside class="k-island side-panel" data-side="left"', 'aside');
  assert.ok(left.includes(' data-folded>'), 'Preview starts with the left panel folded');
  // Layers holds the tree and, under it, the versions; the other panes name their region.
  assert.ok(left.includes('data-pane="layers" id="editor-pane-layers"'));
  assert.ok(
    left.includes(
      '<div class="pane-tree" data-edit="layers"></div><div class="pane-versions" data-timeline',
    ),
  );
  assert.ok(left.includes('data-edit="palette" data-pane="insert"'));
  assert.ok(left.includes('data-edit="why" data-pane="why"'));
  assert.ok(left.includes('data-edit="notes" data-pane="notes"'));
  const right = region(body, '<aside class="k-island side-panel" data-side="right"', 'aside');
  for (const tab of ['properties', 'changes', 'checks', 'ai']) {
    assert.ok(right.includes(`data-tab="${tab}"`), tab);
  }
  assert.ok(!right.includes('data-tab="sketches"'), 'Sketches only on a craft draft');
  assert.ok(right.includes('data-edit="props" data-empty='));
  assert.ok(right.includes('data-edit="changes" data-pane="changes"'));
  assert.ok(right.includes('<div data-edit="conflict" hidden></div>'));
  assert.ok(right.includes('<button type="button" class="side-rail" data-rail="right"'));
  // Checks is the tab shown; the others wait hidden.
  assert.match(right, /id="editor-tab-checks" data-tab="checks"[^>]*aria-selected="true"/);
  assert.match(right, /data-pane="properties"[^>]*hidden>/);
  assert.doesNotMatch(right, /data-pane="checks"[^>]*hidden>/);
  // Rail, left, grip, canvas, grip, right, in that order.
  const order = [
    'data-rail-tab="layers"',
    'data-side="left"',
    'data-grip="left"',
    'data-shell="canvas"',
    'data-grip="right"',
    'data-side="right"',
  ].map((part) => body.indexOf(part));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.ok(order.every((at) => at >= 0));
  assert.ok(text.includes('<div data-edit="menu" hidden></div>'));
});

test('the Checks pane holds what the checks could not do, then the findings', async () => {
  const { store } = shopDraft();
  build(store);
  check(store, checksOf([finding()]));
  const text = await pages(store)('draft', SHOP);
  const checks = region(text, '<section class="pane-host k-rise" data-shell="checks"', 'section');
  assert.ok(checks.includes('<div class="checks-lines"><p>Built from the Tiny kit.</p></div>'));
  assert.ok(checks.includes('<h2 class="checks-group-title">1 to fix</h2>'));
  assert.ok(checks.indexOf('checks-lines') < checks.indexOf('<section class="checks-notes"'));
  // The canvas holds the frame and the dock, not the findings.
  const canvas = region(text, '<section class="stage-canvas" data-shell="canvas"', 'section');
  assert.ok(canvas.includes('data-frame="current"'));
  assert.ok(canvas.includes('data-shell="dock"'));
  assert.ok(!canvas.includes('<li class="note'));
});

test('the address picks the version, state and width; anything else falls back', async () => {
  const { store } = shopDraft();
  const states = {
    schemaVersion: 1,
    default: 'filled',
    states: [
      { id: 'filled', label: 'With data' },
      { id: 'empty', label: 'Empty' },
    ],
  };
  store.writeText('shop', 'v1/src/json/states.json', serializeJson(states));
  addVersion(store, 'shop', NOW);
  build(store);
  build(store, 'shop', 2);
  const view = pages(store);
  const picked = await view('draft', { ...SHOP, query: 'version=1&state=empty&width=1280' });
  assert.match(
    picked,
    new RegExp(
      `src="http://127.0.0.1:5001/f/k3y/shop/v1/html/index\\.html\\?state=empty${HASH_5000}" width="1280"`,
    ),
  );
  assert.ok(picked.includes('data-version="1" data-state="empty" data-width="1280"'));
  // The version menu lists the newest first, the one shown marked, the latest named.
  const versions = region(picked, '<details class="bar-menu" data-shell="version">', 'details');
  assert.ok(
    versions.includes(
      `<summary class="k-btn"><span data-version-name>${t('studio.draft.versionCaption', { version: 1 })}</span><svg`,
    ),
  );
  assert.ok(
    versions.includes(
      `<a class="k-menu-item" href="/drafts/shop?version=2&amp;state=empty&amp;width=1280"><span>Version 2</span><span class="k-meta">${t('studio.edit.shell.latest')}</span></a>`,
    ),
  );
  assert.ok(
    versions.includes(
      '<a class="k-menu-item" href="/drafts/shop?version=1&amp;state=empty&amp;width=1280" aria-current="true"><span>Version 1</span><span class="bar-tick">',
    ),
  );
  assert.ok(
    versions.indexOf('<span>Version 2</span>') < versions.indexOf('<span>Version 1</span>'),
  );
  // An older version cannot be edited, and Edit says why.
  const reason = escapeHtml(t('studio.edit.shell.reason.old'));
  assert.ok(editMode(picked).endsWith(`disabled title="${reason}">`));
  assert.doesNotMatch(picked, EDIT_PANEL);
  const fallback = await view('draft', { ...SHOP, query: 'version=9&state=gone&width=1024' });
  assert.match(
    fallback,
    new RegExp(
      `src="http://127.0.0.1:5001/f/k3y/shop/v2/html/index\\.html\\?state=filled${HASH_5000}" width="390"`,
    ),
  );
});

const STATES_FILE = {
  schemaVersion: 1,
  default: 'filled',
  states: [
    { id: 'filled', label: 'With data' },
    { id: 'empty', label: 'Empty' },
  ],
};

function twoVersions(): DraftStore {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/src/json/states.json', serializeJson(STATES_FILE));
  addVersion(store, 'shop', NOW);
  store.writeText('shop', 'v2/src/json/states.json', serializeJson(STATES_FILE));
  build(store);
  build(store, 'shop', 2);
  return store;
}

test('the frame address ends with a fresh channel and the studio port', async () => {
  const { store } = shopDraft();
  build(store);
  const view = pages(store);
  const first = await view('draft', SHOP);
  const second = await view('draft', SHOP);
  const channelOf = (text: string): string | undefined =>
    /data-channel="([A-Za-z0-9_-]{22})"/.exec(text)?.[1];
  assert.ok(channelOf(first));
  assert.notEqual(channelOf(first), channelOf(second));
  assert.ok(first.includes(`#kitvas=${channelOf(first)}&amp;studio=5000"`));
  assert.ok(first.includes(`data-frame="current" data-channel="${channelOf(first)}"`));
});

test('compare shows the other version first, with the same state and width', async () => {
  const view = pages(twoVersions());
  const text = await view('draft', { ...SHOP, query: 'version=2&state=empty&width=768&compare=1' });
  assert.ok(
    text.includes(
      'data-version="2" data-state="empty" data-width="768" data-compare="1" data-mode="preview">',
    ),
  );
  const before = text.indexOf('data-frame="before"');
  const current = text.indexOf('data-frame="current"');
  assert.ok(before !== -1 && before < current);
  assert.match(text, new RegExp(`/shop/v1/html/index\\.html\\?state=empty${HASH_5000}"`));
  assert.match(text, new RegExp(`/shop/v2/html/index\\.html\\?state=empty${HASH_5000}"`));
  const channels = [...text.matchAll(/data-channel="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(channels.length, 2);
  assert.notEqual(channels[0], channels[1]);
  assert.ok(text.includes('<p class="k-pop cmp-summary" data-compare-summary role="status"'));
  // Comparing: Edit is off and says why.
  const reason = escapeHtml(t('studio.edit.shell.reason.compare'));
  assert.ok(editMode(text).endsWith(`disabled title="${reason}">`));
  assert.doesNotMatch(text, EDIT_PANEL);
});

test('the compare menu marks the compared version and offers to stop', async () => {
  const view = pages(twoVersions());
  const text = await view('draft', { ...SHOP, query: 'version=2&state=empty&width=768&compare=1' });
  const menu = region(text, '<details class="bar-menu" data-shell="compare">', 'details');
  assert.ok(menu.includes(escapeHtml(t('studio.edit.shell.comparing', { version: 1 }))));
  assert.ok(
    menu.includes(
      '<a class="k-menu-item" href="/drafts/shop?version=2&amp;state=empty&amp;width=768&amp;compare=1" aria-current="true"><span>Version 1</span><span class="bar-tick">',
    ),
  );
  assert.ok(
    menu.includes(
      `<a class="k-menu-item" href="/drafts/shop?version=2&amp;state=empty&amp;width=768"><span>${t('studio.draft.stopCompare')}</span></a>`,
    ),
  );
  // The version menu keeps the comparison, except on a link to the compared version itself.
  const versions = region(text, '<details class="bar-menu" data-shell="version">', 'details');
  assert.ok(
    versions.includes('href="/drafts/shop?version=2&amp;state=empty&amp;width=768&amp;compare=1"'),
  );
  assert.ok(versions.includes('href="/drafts/shop?version=1&amp;state=empty&amp;width=768"'));
});

test('without compare every other version is offered; a lone version has none', async () => {
  const view = pages(twoVersions());
  const latest = await view('draft', SHOP);
  const offered = region(latest, '<details class="bar-menu" data-shell="compare">', 'details');
  assert.ok(
    offered.includes(
      `<summary class="k-btn">${COMPARE_ICON}<span class="k-bar-word">${t('studio.edit.shell.compare')}</span><svg`,
    ),
  );
  assert.ok(
    offered.includes(
      'href="/drafts/shop?version=2&amp;state=filled&amp;width=390&amp;compare=1"><span>Version 1</span>',
    ),
  );
  assert.ok(!offered.includes(escapeHtml(t('studio.draft.stopCompare'))));
  // The oldest version compares with a newer one.
  const oldest = await view('draft', { ...SHOP, query: 'version=1' });
  assert.ok(
    oldest.includes('href="/drafts/shop?version=1&amp;state=filled&amp;width=390&amp;compare=2"'),
  );
  const { store } = shopDraft();
  build(store);
  const lone = await pages(store)('draft', SHOP);
  const title = escapeHtml(t('studio.edit.shell.compareNone'));
  assert.ok(
    lone.includes(
      `<button type="button" class="k-btn" data-shell="compare" disabled title="${title}">`,
    ),
  );
  assert.ok(!lone.includes('<details class="bar-menu" data-shell="compare">'));
  // Comparing a version with itself, or with one the draft lacks, is no comparison.
  for (const compare of ['2', '9', 'x']) {
    const text = await view('draft', { ...SHOP, query: `compare=${compare}` });
    assert.ok(!text.includes('data-compare'), compare);
    assert.ok(!text.includes('data-frame="before"'), compare);
  }
});

test('a compared version that is not built says so and has no summary to fill', async () => {
  const { store } = shopDraft();
  addVersion(store, 'shop', NOW);
  build(store, 'shop', 2);
  const text = await pages(store)('draft', { ...SHOP, query: 'compare=1' });
  // Its card says what is missing, with the command, where its frame would be.
  const missing = escapeHtml(t('studio.draft.notBuilt', { version: 1 }));
  assert.ok(
    text.includes(`<div class="card-frame"><div class="k-empty cmp-empty"><p>${missing}</p>`),
  );
  assert.ok(text.includes('data-card="before"'));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(text.includes('data-frame="current"'));
  assert.ok(!text.includes('data-compare-summary'));
});

test('a note carries its tone and, when it has one, its element', async () => {
  const { store } = shopDraft();
  build(store);
  check(
    store,
    checksOf([
      finding({ element: 'Draft:main/Input.0' }),
      finding({ severity: 'review', check: 'ds', rule: 'ds/raw-color', element: null }),
    ]),
  );
  const text = await pages(store)('draft', SHOP);
  const row = '<li class="note k-card checks-finding"';
  assert.ok(
    text.includes(
      `${row} data-tone="fix" data-rule="a11y/label" data-element="Draft:main/Input.0"`,
    ),
  );
  assert.ok(text.includes(`${row} data-tone="review" data-rule="ds/raw-color" data-message=`));
  assert.ok(text.includes('<span class="num checks-num" data-tone="review">2</span>'));
});

test('the Guide, Shortcuts and Doctor pages are routes that load the page script', async () => {
  const { store } = shopDraft();
  const view = pages(store);
  for (const id of ['guide', 'shortcuts', 'doctor']) {
    const text = await view(id);
    assert.ok(text.includes('<main class="k-page start info">'), id);
    assert.ok(text.includes('src="/assets/page.js"></script></main>'), id);
  }
});

test('the gallery ends its main with the gallery script', async () => {
  const { store } = shopDraft();
  const text = await pages(store)('home');
  assert.ok(text.includes('<script type="module" src="/assets/gallery.js"></script></main>'));
  const empty = await pages(tempDrafts().store)('home');
  assert.ok(empty.includes('<script type="module" src="/assets/gallery.js"></script></main>'));
});

test('findings of this state and width are numbered beside the frame, with the next step', async () => {
  const { store } = shopDraft();
  build(store);
  const wide = finding({
    severity: 'review',
    check: 'ds',
    rule: 'ds/raw-color',
    message: 'The total colour is typed by hand.',
    states: ['filled'],
    widths: [1280],
  });
  check(store, checksOf([finding(), wide]));
  const view = pages(store);
  const phone = await view('draft', SHOP);
  assert.ok(phone.includes('<h2 class="checks-group-title">1 to fix</h2>'));
  const where = 'Input.0 in Draft';
  assert.ok(phone.includes(numbered('fix', 1, 'The phone field has no label.', where)));
  assert.ok(!phone.includes('The total colour'));
  assert.ok(phone.includes('1 more in other widths or states.'));
  assert.ok(phone.includes(escapeHtml(t('studio.next.fix', { slug: 'shop' }))));
  const desktop = await view('draft', { ...SHOP, query: 'width=1280' });
  assert.ok(desktop.includes(numbered('review', 2, 'The total colour is typed by hand.', where)));
});

test('clean checks say so and suggest the next version; skipped checks are named', async () => {
  const { store } = shopDraft();
  build(store);
  const checks = {
    build: 'ran',
    types: 'ran',
    ds: 'ran',
    a11y: 'skipped',
    ui: 'skipped',
    ux: 'skipped',
    runtime: 'skipped',
  } as const;
  check(store, checksOf([], { checks }));
  const text = await pages(store)('draft', SHOP);
  assert.ok(
    text.includes(
      '<p>Not run: Accessibility, Look, Usability, Runtime.</p><p>Nothing to fix or review.</p>',
    ),
  );
  assert.ok(text.includes(escapeHtml(t('studio.next.good', { next: 2 }))));
  assert.ok(!text.includes('<h2'));
});

test('a kit that is gone is named by its id; a missing draft is an error', async () => {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: { ...TINY, id: 'gone' }, now: NOW });
  build(store);
  const view = pages(store);
  assert.ok((await view('draft', SHOP)).includes('<p>Built from the gone kit.</p>'));
  await assert.rejects(
    view('draft', { params: { slug: 'nope' } }),
    (error: unknown) => error instanceof KitvasError && error.code === 'DRAFT_NOT_FOUND',
  );
});

test('an older checks.json without ui and ux reads: its findings show, the new checks are not run', async () => {
  const { store } = shopDraft();
  build(store);
  const old = {
    schemaVersion: 1,
    slug: 'shop',
    version: 1,
    checks: { build: 'ran', types: 'ran', ds: 'ran', a11y: 'ran', runtime: 'ran' },
    summary: { fix: 1, review: 0 },
    browser: 'chrome',
    notes: [],
    shots: [],
    findings: [finding({ states: ['filled'], widths: [390, 1280] })],
  };
  store.writeText('shop', 'v1/build/json/checks.json', serializeJson(old));
  const text = await pages(store)('draft', SHOP);
  assert.ok(text.includes('<h2 class="checks-group-title">1 to fix</h2>'));
  assert.ok(text.includes(numbered('fix', 1, 'The phone field has no label.', 'Input.0 in Draft')));
  assert.ok(text.includes('<p>Not run: Look, Usability.</p>'));
});

test('findings seen at widths the studio lacks show at the nearest one', async () => {
  const { store } = shopDraft();
  build(store);
  const narrow = finding({ states: ['filled'], widths: [320], message: 'Wider than 320.' });
  const wide = finding({ states: ['filled'], widths: [1024, 1440], line: 30, message: 'At 1440.' });
  check(store, checksOf([narrow, wide]));
  const view = pages(store);
  const phone = await view('draft', SHOP);
  assert.ok(phone.includes(numbered('fix', 1, 'Wider than 320.')));
  assert.ok(!phone.includes('At 1440.'));
  const desktop = await view('draft', { ...SHOP, query: 'width=1280' });
  assert.ok(desktop.includes(numbered('fix', 1, 'At 1440.')));
  assert.ok(!desktop.includes('Wider than 320.'));
});
