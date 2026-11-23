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

function pages(kits: KitStore) {
  const { store } = tempDrafts();
  const routes = pageRoutes({
    drafts: store,
    kits,
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
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
  assert.ok(text.includes('<h2 id="kit-tokens">Tokens</h2>'));
  assert.ok(text.includes('<h2 id="kit-components">Components</h2>'));
});

test('a component shows its props table, examples and accessibility notes', async () => {
  const text = await pages(createFolderKitStore(FIXTURE_KITS))('kit', { id: 'tiny' });
  assert.ok(text.includes('<div class="scroll" role="region" tabindex="0" aria-label="Button">'));
  assert.ok(text.includes('<th scope="col">Required</th>'));
  assert.ok(text.includes('<td>solid, plain</td><td>solid</td><td>No</td>'));
  assert.ok(text.includes('<pre><code>&lt;Button&gt;Save&lt;/Button&gt;</code></pre>'));
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
    '.swatch[data-token="--kit-color-ink"] { background: #1d2025; }',
    '.swatch[data-token="--kit-color-accent"] { background: #1d2025; }',
    '.swatch[data-token="--kit-color-veil"] { background: rgb(0 0 0 / 0.5); }',
  ]);
  assert.ok(text.includes('<span class="swatch" data-token="--kit-color-ink"></span>'));
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
  assert.ok(text.includes('<a href="/kit/tiny">Tiny</a>'));
  assert.ok(text.includes('Version 1.0.0, 2 components'));
  assert.ok(text.includes('<span>Valid</span>'));
  assert.ok(text.includes('Cannot be read'), 'the broken fixture is listed, not fatal');
  const withProblems = await pages(kitWithProblems())('kits');
  assert.ok(withProblems.includes('<span class="fix">Problems: 1</span>'));
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
  assert.ok(kit.includes('<a class="opt" href="/kit" aria-current="page">Kit</a>'));
  assert.ok(kit.includes('<a class="opt" href="/">Drafts</a>'));
  const list = await view('kits');
  assert.ok(list.includes('<a class="opt" href="/kit" aria-current="page">Kit</a>'));
  const home = await view('home');
  assert.ok(home.includes('<a class="opt" href="/" aria-current="page">Drafts</a>'));
  assert.ok(home.includes('<a class="opt" href="/kit">Kit</a>'));
});
