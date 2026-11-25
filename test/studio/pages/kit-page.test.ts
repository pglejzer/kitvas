import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { cssVarName, type KitStore, loadKit } from '../../../src/kit/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { tempDrafts } from '../../helpers/drafts.ts';
import { builtinKits, copyKit, FIXTURE_KITS, tinyKitJson } from '../../helpers/kits.ts';
import { t } from '../../helpers/translate.ts';

function pages(kits: KitStore, projectKit = 'base') {
  const { store } = tempDrafts();
  const routes = pageRoutes({
    drafts: store,
    kits,
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => projectKit,
  });
  return async (id: string, params: Record<string, string> = {}): Promise<string> => {
    const route = routes.find((candidate) => candidate.id === id);
    assert.ok(route, id);
    const answer = await route.handle({
      params,
      headers: {},
      query: new URLSearchParams(),
      host: '127.0.0.1:5000',
      nonce: 'N0nce',
    });
    assert.equal(typeof answer, 'string');
    return answer as string;
  };
}

/** A kit that parses but has problems: its entry file does not exist. */
function kitWithProblems(): KitStore {
  const root = copyKit('tiny');
  const json = tinyKitJson();
  json.runtime = { entry: 'tsx/missing.ts', styles: { files: [] } };
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  return createFolderKitStore(root);
}

test('the Base kit catalog shows every token and component', async () => {
  const kits = builtinKits();
  const text = await pages(kits)('kit', { id: 'base' });
  const loaded = loadKit(kits, 'base');
  assert.ok(text.includes(`<h1>${loaded.kit.name}</h1>`));
  assert.ok(!text.includes('kit-problems'));
  for (const token of loaded.tokens) {
    assert.ok(text.includes(`<code>${cssVarName(token.path)}</code>`), token.path.join('.'));
  }
  for (const component of loaded.kit.components) {
    assert.ok(text.includes(`<h3>${component.name}`), component.name);
  }
  assert.ok(text.includes('<h2 id="kit-colors">Colors</h2>'));
  assert.ok(text.includes('<h2 id="kit-components">Components</h2>'));
});

test('the page links to each of its sections, and the picker marks the current kit', async () => {
  const text = await pages(builtinKits())('kit', { id: 'base' });
  for (const id of ['kit-colors', 'kit-spacing', 'kit-radius', 'kit-type', 'kit-components']) {
    assert.ok(text.includes(`href="#${id}"`), id);
    assert.ok(text.includes(`id="${id}"`), `${id} has its heading`);
  }
  assert.ok(text.includes('<a class="kit-pick" href="/kit/base" aria-current="page">'));
});

test('a colour shows its contrast on white and on black, and a value with no hex shows none', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kit', { id: 'tiny' });
  assert.ok(text.includes('<span class="k-meta">On white 16.3:1, on black 1.2:1</span>'));
  // The veil has an alpha: it is written as rgb(…), so no ratio is made up for it.
  const veil = /<li class="kit-color">(?:(?!<\/li>)[\s\S])*--kit-color-veil[\s\S]*?<\/li>/.exec(
    text,
  );
  assert.ok(veil);
  assert.ok(!veil[0].includes('On white'));
});

test('spacing is drawn as a bar a rule of the style block sizes, never a style attribute', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kit', { id: 'tiny' });
  assert.ok(text.includes('<span class="kit-bar" data-token="--kit-space-sm"></span>'));
  assert.ok(text.includes('.kit-bar[data-token="--kit-space-sm"] { --size: 8px; }'));
  assert.ok(text.includes('.kit-bar[data-token="--kit-space-none"] { --size: 0px; }'));
});

test('a component shows its props table, examples and accessibility notes', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kit', { id: 'tiny' });
  assert.ok(
    text.includes('<div class="kit-scroll" role="region" tabindex="0" aria-label="Button">'),
  );
  assert.ok(text.includes('<th scope="col">Required</th>'));
  assert.ok(text.includes('<td>solid, plain</td><td>solid</td><td>No</td>'));
  assert.ok(
    text.includes(
      '<pre class="kit-source" tabindex="0"><code>&lt;Button&gt;Save&lt;/Button&gt;</code></pre>',
    ),
  );
  assert.ok(text.includes('Needs a visible label or aria-label'));
  assert.ok(text.includes('<h4>Accessibility</h4>'));
});

test('a kit with problems lists them in words with their paths', async () => {
  const text = await pages(kitWithProblems())('kit', { id: 'tiny' });
  assert.ok(text.includes('<h2 id="kit-problems">Problems</h2>'));
  assert.ok(
    text.includes('File &quot;tsx/missing.ts&quot; is missing. <code>runtime.entry</code>'),
  );
});

test('the swatch style block uses the page nonce and only token values', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kit', { id: 'tiny' });
  const blocks = [...text.matchAll(/<style nonce="N0nce">([\s\S]*?)<\/style>/g)];
  assert.equal(blocks.length, 2, 'the skin and the swatches');
  const swatches = blocks[1]?.[1] ?? '';
  assert.deepEqual(swatches.split('\n'), [
    '.kit-swatch[data-token="--kit-color-ink"] { background: #1d2025; }',
    '.kit-swatch[data-token="--kit-color-accent"] { background: #1d2025; }',
    '.kit-swatch[data-token="--kit-color-veil"] { background: rgb(0 0 0 / 0.5); }',
    '.kit-bar[data-token="--kit-space-sm"] { --size: 8px; }',
    '.kit-bar[data-token="--kit-space-none"] { --size: 0px; }',
    '.kit-sample { font-family: Inter, "Segoe UI", sans-serif; }',
    '.kit-sample[data-token="--kit-font-weight-bold"] { font-weight: 700; }',
  ]);
  assert.ok(text.includes('<span class="kit-swatch" data-token="--kit-color-ink"></span>'));
  assert.ok(!/ style="/.test(text), 'no inline style attributes');
});

test('values from the kit are escaped', async () => {
  const root = copyKit('tiny');
  const json = tinyKitJson();
  json.name = '<script>alert(1)</script>';
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  const view = pages(createFolderKitStore(root));
  const text = await view('kit', { id: 'tiny' });
  assert.ok(!text.includes('<script>alert'));
  assert.ok(text.includes('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>'));
  const list = await view('kits');
  assert.ok(!list.includes('<script>alert'));
});

test('the list shows each kit with its component count and its state', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kits');
  assert.ok(text.includes('<h1>Kits</h1>'));
  assert.ok(text.includes('<a class="kit-tile-name" href="/kit/tiny">Tiny</a>'));
  assert.ok(text.includes('Version 1.0.0, 2 components'));
  assert.ok(text.includes('<span class="k-quiet">Valid</span>'));
  assert.ok(text.includes('Cannot be read'), 'the broken fixture is listed, not fatal');
  const withProblems = await pages(kitWithProblems())('kits');
  assert.ok(withProblems.includes('<span class="k-fix">Problems: 1</span>'));
});

test('an unknown kit is KIT_NOT_FOUND', async () => {
  await assert.rejects(
    async () => pages(builtinKits())('kit', { id: 'nope' }),
    (error: unknown) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
});

test('the nav marks the current page', async () => {
  const view = pages(builtinKits());
  const kit = await view('kit', { id: 'base' });
  assert.ok(kit.includes('<a class="k-btn" href="/kit" aria-current="page">Kit</a>'));
  assert.ok(kit.includes('<a class="k-btn" href="/">Drafts</a>'));
  const list = await view('kits');
  assert.ok(list.includes('<a class="k-btn" href="/kit" aria-current="page">Kit</a>'));
  const home = await view('home');
  assert.ok(home.includes('<a class="k-btn" href="/" aria-current="page">Drafts</a>'));
  assert.ok(home.includes('<a class="k-btn" href="/kit">Kit</a>'));
});

test('the list has the block of the start page, the kits as cards, two ways to add one, and the foot line', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS), 'tiny')('kits');
  assert.ok(text.includes('<main class="k-page start kit-page">'));
  assert.ok(text.includes('<section class="start-block k-inverse info-block">'));
  assert.ok(text.includes('<a class="info-back" href="/">'));
  assert.ok(text.includes(t('studio.kit.lead')));
  assert.ok(/<span>\d+ kits?<\/span>/.test(text), 'the count line');
  assert.ok(text.includes('This project uses Tiny'));
  assert.equal(text.split('Used by this project').length - 1, 1, 'the chip is on one kit only');
  const tiny = /<li class="kit-tile">(?:(?!<\/li>)[\s\S])*href="\/kit\/tiny"[\s\S]*?<\/li>/.exec(
    text,
  );
  assert.ok(tiny?.[0].includes('Used by this project'));
  assert.ok(tiny?.[0].includes('<span class="k-meta kit-tile-source">'), 'the source line');
  assert.ok(text.includes('Add your own kit'));
  const add = text.slice(text.indexOf('id="kit-add"'));
  assert.equal(
    add.slice(0, add.indexOf('</section>')).split('data-copy aria-label').length - 1,
    2,
    'two command boxes with a copy button',
  );
  assert.ok(text.includes('<code>/kitvas:learn</code>'));
  assert.ok(text.includes('kit use &lt;id&gt;</code>'));
  assert.ok(text.includes('<footer class="start-foot">'));
  assert.ok(text.includes('src="/assets/kit.js"'));
});

test('on the list no kit carries the chip when the kit of the project is not among them', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS), 'base')('kits');
  assert.ok(!text.includes('Used by this project'));
});

test('a kit that is not Base has the block with its facts, a card per section and the foot line', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kit', { id: 'tiny' });
  assert.ok(
    text.includes('<main class="k-page start kit-page" data-kit="tiny" data-catalog="missing">'),
  );
  assert.ok(text.includes('<a class="info-back" href="/kit">'));
  assert.ok(text.includes('<span>All kits</span>'));
  assert.ok(text.includes('<h1>Tiny</h1>'));
  assert.ok(text.includes('data-kit-source'));
  assert.ok(
    text.includes(
      '<span><code>tiny</code></span><span>Version 1.0.0</span><span>2 components</span>',
    ),
  );
  assert.ok(/<span>\d+ tokens?<\/span><\/p>/.test(text));
  // Never verified: the command is a box with a copy button, once.
  assert.equal(text.split('class="kit-cmd"').length - 1, 1);
  assert.ok(text.includes('kit verify tiny</code>'));
  for (const id of ['kit-colors', 'kit-spacing', 'kit-type']) {
    assert.ok(
      text.includes(
        `<section class="kit-part kit-card" aria-labelledby="${id}"><header class="kit-part-head"><h2 id="${id}">`,
      ),
      id,
    );
  }
  assert.ok(text.includes('<footer class="start-foot">'));
  assert.ok(!text.includes('kit-verify'), 'no verification card without verify problems');
});

test('a kit with problems has its problems as a card with a count', async () => {
  const text = await pages(kitWithProblems())('kit', { id: 'tiny' });
  assert.ok(
    text.includes(
      '<section class="kit-part kit-card" aria-labelledby="kit-problems"><header class="kit-part-head"><h2 id="kit-problems">Problems</h2><span class="k-meta">1</span>',
    ),
  );
});

test('a kit that cannot be read has a page that says why, with the check command', async () => {
  const kits = createFolderKitStore(FIXTURE_KITS);
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits,
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'base',
  });
  const route = routes.find((candidate) => candidate.id === 'kit');
  assert.ok(route);
  const answer = await route.handle({
    params: { id: 'broken' },
    headers: {},
    query: new URLSearchParams(),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  });
  assert.ok(typeof answer === 'object' && answer !== null && 'status' in answer);
  assert.equal(answer.status, 422);
  const text = String(answer.body);
  assert.ok(text.includes('<main class="k-page start kit-page">'));
  assert.ok(text.includes('<a class="info-back" href="/kit">'));
  assert.ok(text.includes('<h1>broken</h1>'));
  assert.ok(text.includes('data-kit-unreadable>Kit &quot;broken&quot; is not valid:'));
  assert.ok(text.includes('kit check broken</code>'));
  assert.ok(text.includes('<footer class="start-foot">'));
  // The list links the kit to this page.
  const list = await pages(kits)('kits');
  assert.ok(list.includes('<a class="kit-tile-name" href="/kit/broken">broken</a>'));
});
