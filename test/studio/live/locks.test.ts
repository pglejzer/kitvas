import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore, newLock, saveView } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  lockRestore,
  offsetOf,
  sectionScss,
} from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import {
  type LocksEvent,
  lockReport,
  viewNow,
  viewOf,
  watchLocks,
} from '../../../src/studio/live/locks.ts';
import { NOW, tempDrafts, writeVersionFiles } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const LAYOUT = 'md/layout.md';
const HERO = 'src/tsx/sections/Hero.tsx';
const HERO_SCSS = 'src/scss/sections/hero.scss';

const KEPT = '<Badge className="promo">\n          New\n        </Badge>';
const HERO_TSX = [
  "import { Badge, Button, Stack, Text } from '@kit';",
  '',
  'export function Hero() {',
  '  return (',
  '    <section className="hero">',
  '      <Stack gap="md">',
  '        <Text>First</Text>',
  `        ${KEPT}`,
  '        <Button>Go</Button>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const LAYOUT_MD =
  '# Layout: Shop\n\n## hero\nPurpose: Sell.\nComponents: Stack, Text, Badge, Button\n';

const STACK = 'sections/Hero:section/Stack';
const BADGE = `${STACK}/Badge`;
const OTHER = '2026-11-24T08:00:00.000Z';

/** The `shop` draft with its Badge locked, as the editor saved it. */
function setup(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  writeVersionFiles(store, 'shop', 1, {
    [LAYOUT]: LAYOUT_MD,
    [HERO]: HERO_TSX,
    [HERO_SCSS]: '.hero {\n  padding: var(--kit-space-lg);\n}\n',
  });
  saveView(store, 'shop', {
    latest: 1,
    locked: [newLock(BADGE, KEPT, { version: 1, at: OTHER })],
    hidden: [],
  });
  return store;
}

/** Another writer (Claude) writes the hero. */
const write = (store: DraftStore, text: string): void => {
  store.writeText('shop', `v1/${HERO}`, text);
};

test('a locked element moved with its parent, only indented again, is unchanged', async () => {
  const store = setup();
  const deeper = HERO_TSX.replace(
    `        ${KEPT}`,
    '        <Stack>\n          <Badge className="promo">\n            New\n          </Badge>\n        </Stack>',
  );
  write(store, deeper);
  const report = await lockReport({ drafts: store, compiler }, 'shop');
  assert.deepEqual(
    report.entries.map((entry) => [entry.state, entry.element?.id]),
    [['same', `${STACK}/Stack/Badge`]],
  );
  // The view names the lock by its element's id now.
  assert.deepEqual(viewOf(report, []), {
    locked: [`${STACK}/Stack/Badge`],
    hidden: [],
    changed: [],
    lost: [],
  });
});

test('a locked element another writer rewrote is changed', async () => {
  const store = setup();
  write(store, HERO_TSX.replace(KEPT, '<Badge className="promo">Sale</Badge>'));
  const view = await viewNow({ drafts: store, compiler }, 'shop');
  assert.deepEqual(view, { locked: [BADGE], hidden: [], changed: [BADGE], lost: [] });
});

test('a locked element another writer took away is lost', async () => {
  const store = setup();
  write(store, HERO_TSX.replace(`        ${KEPT}\n`, ''));
  const view = await viewNow({ drafts: store, compiler }, 'shop');
  assert.deepEqual(view, { locked: [], hidden: [], changed: [], lost: [BADGE] });
});

test('a file that does not compile now keeps its locks as they were', async () => {
  const store = setup();
  write(store, 'export function Hero( {');
  const report = await lockReport({ drafts: store, compiler }, 'shop');
  assert.deepEqual(
    report.entries.map((entry) => entry.state),
    ['unread'],
  );
  assert.deepEqual(viewOf(report, []).locked, [BADGE]);
});

test("Restore puts the kept source back byte for byte, through the editor's own edit", async () => {
  const store = setup();
  write(store, HERO_TSX.replace(KEPT, '<Badge className="promo">Sale</Badge>'));
  const text = store.readText('shop', `v1/${HERO}`) ?? '';
  const report = await lockReport({ drafts: store, compiler }, 'shop');
  const [entry] = report.entries;
  assert.ok(entry?.element);
  const preview = lockRestore(builtinKits(), {
    id: entry.element.id,
    file: entry.element.file,
    kept: entry.lock.text,
    text,
    at: offsetOf(text, entry.element.line, entry.element.column),
    kitId: 'base',
  });
  assert.ok(preview?.ops, JSON.stringify(preview));
  assert.equal(preview.old, '<Badge className="promo">\n  New\n</Badge>');
  assert.equal(preview.current, '<Badge className="promo">Sale</Badge>');
  assert.deepEqual([preview.missing, preview.imports], [[], []]);

  const deps: ApplyEditsDeps = {
    drafts: store,
    compiler,
    kits: builtinKits(),
    now: () => new Date('2026-11-24T09:00:00.000Z'),
    etag: etagOf,
    sectionScss: (slug, version, file) => sectionScss(store, slug, version, file),
  };
  const etags = Object.fromEntries(
    [LAYOUT, HERO, HERO_SCSS].map((file) => [
      file,
      etagOf(store.readText('shop', `v1/${file}`) ?? ''),
    ]),
  );
  const result = await applyEdits(deps, { slug: 'shop', version: 1, ops: preview.ops, etags });
  assert.equal(result.outcome, 'applied', JSON.stringify(result));
  assert.equal(store.readText('shop', `v2/${HERO}`), HERO_TSX);
});

test("the watch compares the locks after another writer's change only, and tells each change once", async () => {
  const store = setup();
  const events: LocksEvent[] = [];
  const watch = watchLocks({ drafts: store, compiler, publish: (event) => events.push(event) });
  const source = { slug: 'shop', version: 1, files: {} };
  write(store, HERO_TSX.replace(KEPT, '<Badge className="promo">Sale</Badge>'));
  watch.heard({ ...source, by: 'editor' });
  await watch.close();
  // A length check: deepEqual with [] would narrow the array to never[].
  assert.equal(events.length, 0);

  const again = watchLocks({ drafts: store, compiler, publish: (event) => events.push(event) });
  again.heard({ ...source, by: 'other' });
  again.heard({ ...source, by: 'other' });
  await again.close();
  assert.deepEqual(events, [{ slug: 'shop', changed: [BADGE] }]);
});
