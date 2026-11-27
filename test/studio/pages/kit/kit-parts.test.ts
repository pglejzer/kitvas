import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../../../src/kit/index.ts';
import { pageRoutes } from '../../../../src/studio/pages/routes.ts';
import { tempDrafts } from '../../../helpers/draft/drafts.ts';
import { builtinKits, copyKit, FIXTURE_KITS, tinyKitJson } from '../../../helpers/kit/kits.ts';
import { t } from '../../../helpers/translate.ts';

/** The kit page of `id` as the address `?<query>` asks for it. */
function kitPage(query = '', kits: KitStore = builtinKits(), id = 'kitvas-ui'): string {
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits,
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'kitvas-ui',
  });
  const route = routes.find((candidate) => candidate.id === 'kit');
  assert.ok(route);
  return route.handle({
    params: { id },
    headers: {},
    query: new URLSearchParams(query),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  }) as unknown as string;
}

/** The parts of a page in order, each with whether it shows. */
const partsOf = (text: string): [id: string, shown: boolean][] =>
  [...text.matchAll(/<div class="kit-view" data-view="([^"]+)"( hidden)?>/g)].map((match) => [
    match[1] ?? '',
    match[2] === undefined,
  ]);

const shownOf = (text: string): string[] =>
  partsOf(text)
    .filter(([, shown]) => shown)
    .map(([id]) => id);

test('every part is in the page and only the first shows', () => {
  const text = kitPage();
  assert.deepEqual(
    partsOf(text).map(([id]) => id),
    [
      'kit-colors',
      'kit-spacing',
      'kit-radius',
      'kit-type',
      'kit-other',
      'kit-cat-action',
      'kit-cat-input',
      'kit-cat-layout',
      'kit-cat-typography',
      'kit-cat-display',
      'kit-cat-feedback',
      'kit-cat-overlay',
      'kit-cat-navigation',
      'kit-icons',
    ],
  );
  assert.deepEqual(shownOf(text), ['kit-colors']);
  assert.ok(text.includes('<div class="kit-main" data-view-main>'));
});

test('the address picks the part, and a part the kit lacks leaves the first', () => {
  assert.deepEqual(shownOf(kitPage('view=kit-cat-input')), ['kit-cat-input']);
  assert.deepEqual(shownOf(kitPage('view=kit-icons')), ['kit-icons']);
  assert.deepEqual(shownOf(kitPage('view=nope')), ['kit-colors']);
  assert.deepEqual(shownOf(kitPage('view=')), ['kit-colors']);
  assert.deepEqual(shownOf(kitPage('view=kit-problems')), ['kit-colors'], 'not a part');
});

test('the left side has the search, the tokens and the components under their titles, then the icons', () => {
  const text = kitPage('view=kit-cat-input');
  const side = text.slice(text.indexOf('<aside class="kit-side">'), text.indexOf('</aside>'));
  assert.ok(
    side.includes(
      '<input class="k-field" type="search" data-kit-search placeholder="Search this kit" aria-label="Search this kit" autocomplete="off" spellcheck="false">',
    ),
  );
  assert.ok(side.indexOf('data-kit-search') < side.indexOf('class="kit-picks"'));
  assert.ok(side.includes('<nav class="kit-parts" aria-label="Parts of this kit">'));
  const tokens = side.indexOf('<h2 class="kit-side-title">Tokens</h2>');
  const components = side.indexOf('<h2 class="kit-side-title">Components</h2>');
  const colors = side.indexOf('data-view-link="kit-colors"');
  const input = side.indexOf('data-view-link="kit-cat-input"');
  const icons = side.indexOf('data-view-link="kit-icons"');
  assert.ok(tokens !== -1 && tokens < colors && colors < components);
  assert.ok(components < input && input < icons);
  assert.ok(
    side.includes(
      '<a class="kit-link" href="?view=kit-cat-input" data-view-link="kit-cat-input" aria-current="true"><span class="k-clip">Input</span><span class="k-meta">11</span></a>',
    ),
  );
  assert.equal(side.split('aria-current="true"').length - 1, 1, 'one part is the current one');
  assert.ok(!side.includes('kit-problems'), 'no problems, no link to them');
});

test('a category is a part with its own heading, its count and the notes of the build', () => {
  const text = kitPage('view=kit-cat-action');
  assert.ok(
    text.includes(
      '<div class="kit-view" data-view="kit-cat-action"><section class="kit-part" aria-labelledby="kit-cat-action"><header class="kit-part-head"><h2 id="kit-cat-action">Action components</h2><span class="k-meta" data-view-count>3</span></header><p class="k-quiet" data-catalog-note="building">',
    ),
  );
});

test('a component folds: closed it shows its name and what it is for, and it is found by both', () => {
  const text = kitPage('', createFolderKitStore(FIXTURE_KITS), 'tiny');
  assert.ok(
    text.includes(
      '<article class="kit-card kit-fold" data-search="Button Starts an action."><details><summary><h3>Button</h3><span class="k-quiet">Starts an action.</span><svg class="k-icon"',
    ),
  );
  assert.ok(!text.includes('<details open'), 'every component starts closed');
  assert.ok(text.includes('</summary><div class="kit-card-body">'));
});

test('a token is found by its name and its value', () => {
  const text = kitPage('', createFolderKitStore(FIXTURE_KITS), 'tiny');
  assert.ok(text.includes('<li class="kit-color" data-search="--kit-color-ink #1d2025">'));
  assert.ok(text.includes('<li class="kit-scale-row" data-search="--kit-space-sm 8px">'));
});

test('the line for a search that finds nothing is in the page, hidden', () => {
  assert.ok(
    kitPage().includes(
      '<p class="k-quiet" data-search-empty hidden>Nothing in this kit matches your search.</p>',
    ),
  );
});

test('the problems show above every part and have a link of their own', () => {
  const root = copyKit('tiny');
  const json = tinyKitJson();
  json.runtime = { entry: 'tsx/missing.ts', styles: { files: [] } };
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  const text = kitPage('view=kit-spacing', createFolderKitStore(root), 'tiny');
  assert.ok(
    text.includes(
      '<ul class="kit-links kit-links-alone" role="list"><li><a class="kit-link" href="#kit-problems"><span class="k-clip">Problems</span><span class="k-meta">1</span></a></li></ul>',
    ),
  );
  assert.ok(text.indexOf('id="kit-problems"') < text.indexOf('<div class="kit-view"'));
  assert.deepEqual(shownOf(text), ['kit-spacing']);
});

test('a value from the kit is escaped in the words it is found by', () => {
  const root = copyKit('tiny');
  const json = tinyKitJson() as { components: { description: string }[] };
  const first = json.components[0];
  assert.ok(first);
  first.description = '"><script>alert(1)</script>';
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  const text = kitPage('', createFolderKitStore(root), 'tiny');
  assert.ok(!text.includes('<script>alert'));
  assert.ok(text.includes('data-search="Button &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
});
