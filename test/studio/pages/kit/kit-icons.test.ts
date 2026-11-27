import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { PreviewsStamp } from '../../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../../../src/kit/index.ts';
import { iconsParts } from '../../../../src/studio/pages/kit/kit-icons.ts';
import { pageRoutes } from '../../../../src/studio/pages/routes.ts';
import type { KitPreviews } from '../../../../src/studio/previews/keeper.ts';
import type { IconsView } from '../../../../src/studio/views/kit-icons.ts';
import { tempDrafts } from '../../../helpers/draft/drafts.ts';
import { KIT_STAMP, writeCatalog } from '../../../helpers/kit/catalog.ts';
import { builtinKits, copyKit, tinyKitJson } from '../../../helpers/kit/kits.ts';
import { tempDir } from '../../../helpers/tmp.ts';
import { t } from '../../../helpers/translate.ts';

const VIEW: IconsView = {
  rows: [
    { name: 'plus', drawn: true },
    { name: 'cart', drawn: false },
  ],
  rules: '',
  coming: false,
};

test('the icons are one part: a card with a picture and the name, or the name alone', () => {
  const parts = iconsParts(t, VIEW);
  assert.deepEqual(
    parts.map(({ id, label, count }) => ({ id, label, count })),
    [{ id: 'kit-icons', label: 'Icons', count: 2 }],
  );
  const text = parts[0]?.body.text ?? '';
  assert.ok(
    text.startsWith(
      '<section class="kit-part kit-card" aria-labelledby="kit-icons"><header class="kit-part-head"><h2 id="kit-icons">Icons</h2><span class="k-meta" data-view-count>2</span></header><ul class="kit-icons" role="list">',
    ),
  );
  assert.ok(
    text.includes(
      '<li class="kit-icon" data-search="plus"><span class="kit-glyph-tile" aria-hidden="true"><span class="kit-glyph" data-icon="plus"></span></span><code>plus</code></li>',
    ),
  );
  assert.ok(text.includes('<li class="kit-icon" data-search="cart"><code>cart</code></li>'));
  assert.ok(!text.includes('data-icons-note'));
});

test('while the first pictures are made the card says so', () => {
  const text = iconsParts(t, { ...VIEW, coming: true })[0]?.body.text ?? '';
  assert.ok(
    text.includes(
      '<p class="k-quiet" data-icons-note>The pictures of the icons are being made.</p><ul',
    ),
  );
});

test('a kit that names no icon has no icons part', () => {
  assert.deepEqual(iconsParts(t, { rows: [], rules: '', coming: false }), []);
});

const STAMP: PreviewsStamp = {
  schemaVersion: 1,
  kit: 'kitvas-ui',
  format: 2,
  catalog: 'a'.repeat(64),
  folder: 'v2-0123456789abcdef',
  backdrop: '#e4e6ea',
  components: {},
  icons: { file: 'icons.png', cell: 32, columns: 32, names: ['plus', 'cart'] },
};

/** The kit page of `id`, and the kits whose previews it asked for. */
function kitPage(
  options: { kits?: KitStore; id?: string; project?: string; view?: KitPreviews } = {},
): { text: string; asked: string[] } {
  const asked: string[] = [];
  const { view } = options;
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits: options.kits ?? builtinKits(),
    ...(options.project === undefined ? {} : { project: options.project }),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    ...(view === undefined
      ? {}
      : {
          previews: {
            frame: { port: 5001, key: 'k3y' },
            keeper: {
              view: (kitId) => {
                asked.push(kitId);
                return view;
              },
            },
          },
        }),
    version: '1.0.0',
    projectKit: () => 'kitvas-ui',
  });
  const route = routes.find((candidate) => candidate.id === 'kit');
  assert.ok(route);
  const text = route.handle({
    params: { id: options.id ?? 'kitvas-ui' },
    headers: {},
    query: new URLSearchParams(),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  }) as unknown as string;
  return { text, asked };
}

const builtProject = (): string => {
  const project = tempDir('kitvas-project-');
  writeCatalog(project);
  return project;
};

test('the kit page draws the icons of the sheet and names the rest', () => {
  const { text, asked } = kitPage({
    project: builtProject(),
    view: { state: 'ready', stamp: STAMP },
  });
  assert.deepEqual(asked, ['kitvas-ui']);
  assert.ok(
    text.includes('<h2 id="kit-icons">Icons</h2><span class="k-meta" data-view-count>112</span>'),
  );
  assert.ok(
    text.includes(
      '<a class="kit-link" href="?view=kit-icons" data-view-link="kit-icons"><span class="k-clip">Icons</span><span class="k-meta">112</span></a>',
    ),
  );
  assert.ok(
    text.includes(
      '.kit-glyph { background-image: url("http://127.0.0.1:5001/k/k3y/kitvas-ui/previews/v2-0123456789abcdef/icons.png"); background-size: 1024px auto; }',
    ),
  );
  assert.ok(text.includes('.kit-glyph[data-icon="cart"] { background-position: -32px 0px; }'));
  assert.ok(
    text.includes('<span class="kit-glyph" data-icon="cart"></span></span><code>cart</code>'),
  );
  assert.ok(text.includes('<li class="kit-icon" data-search="bell"><code>bell</code></li>'));
  assert.ok(!text.includes('data-icons='), 'nothing to wait for');
  assert.ok(!/ style="/.test(text));
});

test('while the sheet is being made the page waits for it', () => {
  const { text } = kitPage({
    project: builtProject(),
    view: { state: 'making', stamp: undefined },
  });
  assert.ok(
    text.includes(
      '<main class="k-page start kit-page" data-kit="kitvas-ui" data-catalog="ready" data-icons="making">',
    ),
  );
  assert.ok(text.includes('data-icons-note>The pictures of the icons are being made.</p>'));
  assert.ok(!text.includes('kit-glyph'));
});

test('the sheet is asked for only once the examples of the kit were built', () => {
  const view: KitPreviews = { state: 'ready', stamp: STAMP };
  const unbuilt = kitPage({ project: tempDir('kitvas-project-'), view });
  assert.deepEqual(unbuilt.asked, []);
  assert.ok(
    unbuilt.text.includes('<li class="kit-icon" data-search="cart"><code>cart</code></li>'),
  );
  assert.deepEqual(kitPage({ view }).asked, [], 'no project folder');
});

test('a studio that makes no previews names the icons', () => {
  const { text } = kitPage({ project: builtProject() });
  assert.ok(text.includes('<h2 id="kit-icons">Icons</h2>'));
  assert.ok(text.includes('<li class="kit-icon" data-search="plus"><code>plus</code></li>'));
  assert.ok(!text.includes('kit-glyph'));
});

test('a kit without icons of its own has no icons card, and its sheet is not asked for', () => {
  const root = copyKit('tiny');
  const { icons: _icons, ...json } = tinyKitJson();
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  const project = tempDir('kitvas-project-');
  writeCatalog(project, { ...KIT_STAMP, kit: 'tiny' });
  const { text, asked } = kitPage({
    kits: createFolderKitStore(root),
    id: 'tiny',
    project,
    view: { state: 'ready', stamp: STAMP },
  });
  assert.ok(!text.includes('kit-icons'));
  assert.deepEqual(asked, []);
});
