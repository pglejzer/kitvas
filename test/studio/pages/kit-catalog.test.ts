import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../../src/kit/index.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { BASE_STAMP, writeCatalog } from '../../helpers/catalog.ts';
import { tempDrafts } from '../../helpers/drafts.ts';
import { builtinKits, copyKit, tinyKitJson } from '../../helpers/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';

function kitPageOf(kits: KitStore, project: string | undefined, id: string): string {
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits,
    ...(project === undefined ? {} : { project }),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '0.1.0',
    projectKit: () => 'base',
  });
  const route = routes.find((candidate) => candidate.id === 'kit');
  assert.ok(route);
  return route.handle({
    params: { id },
    headers: {},
    query: new URLSearchParams(),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  }) as unknown as string;
}

const FRAME = /<iframe class="kit-frame"[^>]*><\/iframe>/g;
const SOURCE =
  '<pre class="kit-source" tabindex="0"><code>&lt;Button&gt;Save&lt;/Button&gt;</code></pre>';

test('without a stamp the page is missing its catalog and shows the building note', () => {
  const text = kitPageOf(builtinKits(), tempDir('kitvas-project-'), 'base');
  assert.ok(
    text.includes('<main class="k-page start kit-page" data-kit="base" data-catalog="missing">'),
  );
  assert.ok(
    text.includes(
      '<p class="k-quiet" data-catalog-note="building">The examples are being built.</p>',
    ),
  );
  assert.ok(text.includes('<p class="k-fix" data-catalog-note="failed" hidden>'));
  assert.ok(text.includes('Run &quot;kitvas kit build base&quot; to see why.'));
  assert.equal(text.match(FRAME), null, 'no frame without a build');
  assert.ok(text.includes(SOURCE));
});

test('a page without a project folder is the same as one without a catalog', () => {
  const text = kitPageOf(builtinKits(), undefined, 'base');
  assert.ok(text.includes('data-catalog="missing"'));
  assert.equal(text.match(FRAME), null);
});

test('a stamp that is not valid JSON counts as missing', () => {
  const project = tempDir('kitvas-project-');
  const dir = writeCatalog(project);
  writeFileSync(join(dir, 'build', 'json', 'catalog.json'), '{not json');
  assert.ok(kitPageOf(builtinKits(), project, 'base').includes('data-catalog="missing"'));
});

test('with a stamp a shown example gets a sandboxed frame on the prototype origin', () => {
  const project = tempDir('kitvas-project-');
  writeCatalog(project);
  const text = kitPageOf(builtinKits(), project, 'base');
  assert.ok(
    text.includes('<main class="k-page start kit-page" data-kit="base" data-catalog="ready">'),
  );
  assert.ok(text.includes('<p class="k-quiet" data-catalog-note="building" hidden>'));
  const frames = text.match(FRAME) ?? [];
  assert.equal(frames.length, 1, 'only the shown example');
  const frame = frames[0] ?? '';
  const channel = /data-channel="([^"]+)"/.exec(frame)?.[1];
  assert.ok(channel);
  assert.ok(frame.startsWith('<iframe class="kit-frame" data-example="Button.1" '));
  assert.ok(
    frame.includes(
      `src="http://127.0.0.1:5001/k/k3y/base/html/index.html?example=Button.1#kitvas=${channel}&amp;studio=5000"`,
    ),
  );
  assert.ok(
    frame.endsWith(
      ' sandbox="allow-scripts" title="Button: Primary action" loading="lazy"></iframe>',
    ),
  );
  assert.ok(!frame.includes('allow-same-origin'));
});

test('a skipped example shows the note, a shown one keeps it hidden', () => {
  const project = tempDir('kitvas-project-');
  writeCatalog(project);
  const text = kitPageOf(builtinKits(), project, 'base');
  assert.ok(
    text.includes(
      '<p class="k-quiet" data-preview-note="Button.2">No preview for this example.</p>',
    ),
  );
  assert.ok(
    text.includes(
      '<p class="k-quiet" data-preview-note="Button.1" hidden>No preview for this example.</p>',
    ),
  );
  // An example of the stamp's neither list is not framed and keeps its note hidden too.
  assert.ok(text.includes('data-preview-note="Input.1" hidden'));
});

test('every frame of a page has a channel of its own', () => {
  const project = tempDir('kitvas-project-');
  writeCatalog(project, { ...BASE_STAMP, shown: ['Button.1', 'Button.2'], skipped: [] });
  const text = kitPageOf(builtinKits(), project, 'base');
  const channels = [...text.matchAll(/class="kit-frame"[^>]*data-channel="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(channels.length, 2);
  assert.notEqual(channels[0], channels[1]);
  assert.notEqual(text, kitPageOf(builtinKits(), project, 'base'), 'channels change per render');
});

test('the script tag carries the nonce and the page has no inline style attribute', () => {
  const text = kitPageOf(builtinKits(), tempDir('kitvas-project-'), 'base');
  assert.ok(text.includes('<script type="module" nonce="N0nce" src="/assets/kit.js"></script>'));
  assert.ok(!/ style="/.test(text));
});

test('example titles and kit ids are escaped in the title and the caption', () => {
  const root = copyKit('tiny');
  const json = tinyKitJson() as { components: { examples?: { title: string }[] }[] };
  const first = json.components[0]?.examples?.[0];
  assert.ok(first);
  first.title = '"><script>alert(1)</script>';
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  const project = tempDir('kitvas-project-');
  writeCatalog(project, { ...BASE_STAMP, kit: 'tiny', shown: ['Button.1'], skipped: [] });
  const text = kitPageOf(createFolderKitStore(root), project, 'tiny');
  assert.ok(!text.includes('<script>alert'));
  assert.ok(text.includes('title="Button: &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
  assert.ok(
    text.includes('<figcaption>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</figcaption>'),
  );
});
