import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore, readRenames } from '../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditInput,
  type EditOp,
  type EditResult,
  sectionScss,
} from '../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { etagOf } from '../../src/studio/http/etag.ts';
import { NOW, readVersionFiles, tempDrafts, writeVersionFiles } from '../helpers/drafts.ts';
import { builtinKits } from '../helpers/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const LATER = new Date('2026-11-24T09:00:00.000Z');

const LAYOUT = 'md/layout.md';
const HERO = 'src/tsx/sections/Hero.tsx';
const HERO_SCSS = 'src/scss/sections/hero.scss';
const FOOTER = 'src/tsx/sections/Footer.tsx';
const FOOTER_SCSS = 'src/scss/sections/footer.scss';
const FILES = [LAYOUT, HERO, HERO_SCSS, FOOTER, FOOTER_SCSS];

const LAYOUT_MD = [
  '# Layout: Shop',
  '',
  '## hero',
  'Purpose: Say what the shop sells.',
  'Components: Stack, Text, Badge, Button',
  '',
  '## footer',
  'Purpose: Close the page.',
  'Components: Stack, Text',
  '',
].join('\n');

const FIRST_LINE = '        <Text>First</Text>\n';
const SECOND_LINE = '        <Text>Second</Text>\n';
const BADGE_LINE = '        <Badge className="promo">New</Badge>\n';
const BUTTON_LINE = '        <Button>Go</Button>\n';
const HERO_TSX = [
  "import { Badge, Button, Stack, Text } from '@kit';",
  '',
  'export function Hero() {',
  '  return (',
  '    <section className="hero">',
  '      <Stack gap="md">',
  `${FIRST_LINE}${SECOND_LINE}${BADGE_LINE}${BUTTON_LINE}      </Stack>`,
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const PROMO_RULE = '.promo {\n  color: var(--kit-color-accent);\n}\n';
const HERO_SCSS_TEXT = `.hero {\n  padding: var(--kit-space-lg);\n}\n\n${PROMO_RULE}`;

const THANKS_LINE = '        <Text>Thanks</Text>\n';
const FOOTER_TSX = [
  "import { Stack, Text } from '@kit';",
  '',
  'export function Footer() {',
  '  return (',
  '    <footer className="footer">',
  '      <Stack gap="sm">',
  `${THANKS_LINE}      </Stack>`,
  '    </footer>',
  '  );',
  '}',
  '',
].join('\n');
const FOOTER_SCSS_TEXT = '.footer {\n  padding: var(--kit-space-md);\n}\n';

const STACK = 'sections/Hero:section/Stack';
const FIRST = `${STACK}/Text`;
const SECOND = `${STACK}/Text.2`;
const BADGE = `${STACK}/Badge`;
const BUTTON = `${STACK}/Button`;
const FOOTER_STACK = 'sections/Footer:footer/Stack';
const THANKS = `${FOOTER_STACK}/Text`;

/** The hero with `Second` moved before `First`. */
const SWAPPED = HERO_TSX.replace(`${FIRST_LINE}${SECOND_LINE}`, `${SECOND_LINE}${FIRST_LINE}`);
const SWAP: EditOp = { op: 'moveElement', id: SECOND, anchor: FIRST, place: 'before' };
/** The hero and the footer with the kit import of the hero's `Badge` moved over. */
const HERO_NO_BADGE = HERO_TSX.replace('{ Badge, Button,', '{ Button,');
const FOOTER_BADGE = FOOTER_TSX.replace('{ Stack, Text }', '{ Badge, Stack, Text }');

type Written = { slug: string; version: number; etags: Record<string, string> };

/** The `shop` draft on the Base kit at v1 with two sections, and the real compiler. */
function setup() {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  writeVersionFiles(store, 'shop', 1, {
    [LAYOUT]: LAYOUT_MD,
    [HERO]: HERO_TSX,
    [HERO_SCSS]: HERO_SCSS_TEXT,
    [FOOTER]: FOOTER_TSX,
    [FOOTER_SCSS]: FOOTER_SCSS_TEXT,
  });
  const written: Written[] = [];
  const deps: ApplyEditsDeps = {
    drafts: store,
    compiler,
    kits: builtinKits(),
    now: () => LATER,
    etag: etagOf,
    sectionScss: (slug, version, file) => sectionScss(store, slug, version, file),
    beforeWrite: (slug, version, etags) => {
      written.push({ slug, version, etags });
    },
  };
  return { store, deps, written };
}

const read = (store: DraftStore, version: number, file: string): string =>
  store.readText('shop', `v${version}/${file}`) ?? '';

const filesOf = (store: DraftStore, version: number) =>
  readVersionFiles(store, 'shop', version, FILES);

/** The ETags of a version's files, as the editor last heard them. */
const etagsOf = (store: DraftStore, version: number): Record<string, string> =>
  Object.fromEntries(
    FILES.flatMap((file): [string, string][] => {
      const text = store.readText('shop', `v${version}/${file}`);
      return text === undefined ? [] : [[file, etagOf(text)]];
    }),
  );

const request = (
  store: DraftStore,
  version: number,
  ops: EditOp[],
  over: Partial<EditInput> = {},
): EditInput => ({ slug: 'shop', version, ops, etags: etagsOf(store, version), ...over });

/** draft.json and every file of v1 and v2: what "nothing was written" compares. */
const snapshot = (store: DraftStore) => ({
  draft: store.readText('shop', 'draft.json'),
  v1: filesOf(store, 1),
  v2: filesOf(store, 2),
});

function applied(result: EditResult): Extract<EditResult, { outcome: 'applied' }> {
  assert.equal(result.outcome, 'applied', JSON.stringify(result));
  if (result.outcome !== 'applied') throw new Error('not applied');
  return result;
}

test('a move and its inverse give the file back byte for byte, and their renames cancel out', async () => {
  const { store, deps } = setup();
  const moved = applied(await applyEdits(deps, request(store, 1, [SWAP])));
  assert.equal(read(store, 2, HERO), SWAPPED);
  assert.deepEqual(moved.renames, { [SECOND]: FIRST, [FIRST]: SECOND });
  assert.deepEqual([moved.created, moved.dropped], [[], []]);
  // The inverse of a structural change is made from the texts: hunks, never ids.
  assert.ok(moved.inverse.every((op) => op.op === 'patch' && op.file === HERO));

  const undone = applied(await applyEdits(deps, request(store, 2, moved.inverse)));
  assert.equal(read(store, 2, HERO), HERO_TSX);
  assert.equal(Object.keys(undone.renames).length, Object.keys(moved.renames).length);
  for (const [old, now] of Object.entries(moved.renames)) assert.equal(undone.renames[now], old);
  // Each request's renames are in the version's log, in order.
  const steps = readRenames(store, 'shop', 2);
  assert.deepEqual(
    steps.map((step) => step.renames),
    [moved.renames, undone.renames],
  );
  assert.equal(steps[0]?.at, LATER.toISOString());
});

test('a later op of a request names its element by the id it had before the request', async () => {
  const { store, deps } = setup();
  const text: EditOp = { op: 'setText', id: SECOND, value: 'Second!', before: 'Second' };
  const result = applied(await applyEdits(deps, request(store, 1, [SWAP, text])));
  const expected = SWAPPED.replace('<Text>Second</Text>', '<Text>Second!</Text>');
  assert.equal(read(store, 2, HERO), expected);
  assert.deepEqual(result.renames, { [SECOND]: FIRST, [FIRST]: SECOND });
  // A request with a structural op is undone by text hunks, its 4a op with it.
  assert.ok(result.inverse.every((op) => op.op === 'patch'));
  applied(await applyEdits(deps, request(store, 2, result.inverse)));
  assert.equal(read(store, 2, HERO), HERO_TSX);
});

test('a move to another section takes its class rule along, and the kit imports follow', async () => {
  const { store, deps } = setup();
  const op: EditOp = { op: 'moveElement', id: BADGE, anchor: FOOTER_STACK, place: 'last' };
  const result = applied(await applyEdits(deps, request(store, 1, [op])));
  assert.equal(read(store, 2, HERO), HERO_NO_BADGE.replace(BADGE_LINE, ''));
  const footer = FOOTER_BADGE.replace(THANKS_LINE, `${THANKS_LINE}${BADGE_LINE}`);
  assert.equal(read(store, 2, FOOTER), footer);
  const heroScss = read(store, 2, HERO_SCSS);
  const footerScss = read(store, 2, FOOTER_SCSS);
  // Nothing in the hero uses the class now, so its rule left with the element.
  assert.ok(!heroScss.includes('.promo'), heroScss);
  assert.ok(heroScss.startsWith('.hero {'), heroScss);
  assert.ok(footerScss.startsWith(FOOTER_SCSS_TEXT), footerScss);
  assert.ok(footerScss.includes(PROMO_RULE), footerScss);
  const written = Object.keys(result.etags).sort();
  assert.deepEqual(written, [FOOTER, HERO, FOOTER_SCSS, HERO_SCSS].sort());
  // The moved element is still the same element, under its new id.
  assert.deepEqual(result.renames, { [BADGE]: `${FOOTER_STACK}/Badge` });
  assert.deepEqual(result.created, []);

  applied(await applyEdits(deps, request(store, 2, result.inverse)));
  assert.deepEqual(filesOf(store, 2), filesOf(store, 1));
});

test('an insert from a palette example adds its component to the kit import', async () => {
  const { store, deps } = setup();
  const source = '<Badge tone="fix">1 to fix</Badge>';
  const op: EditOp = { op: 'insertElement', anchor: THANKS, place: 'after', source };
  const result = applied(await applyEdits(deps, request(store, 1, [op])));
  const footer = FOOTER_BADGE.replace(THANKS_LINE, `${THANKS_LINE}        ${source}\n`);
  assert.equal(read(store, 2, FOOTER), footer);
  assert.deepEqual(result.created, [`${FOOTER_STACK}/Badge`]);
  assert.deepEqual(result.renames, {});
  const step = { at: LATER.toISOString(), renames: {}, created: [`${FOOTER_STACK}/Badge`] };
  assert.deepEqual(readRenames(store, 'shop', 2), [step]);

  applied(await applyEdits(deps, request(store, 2, result.inverse)));
  assert.equal(read(store, 2, FOOTER), FOOTER_TSX);
});

test('an undo still applies after Claude changed another line of the same file', async () => {
  const { store, deps } = setup();
  const moved = applied(await applyEdits(deps, request(store, 1, [SWAP])));
  const etags = etagsOf(store, 2);
  // Claude's line is outside the hunk of the move, so the undo leaves it as Claude wrote it.
  const go = (text: string): string => text.replace('>Go</Button>', '>Go now</Button>');
  store.writeText('shop', `v2/${HERO}`, go(read(store, 2, HERO)));
  const undone = applied(await applyEdits(deps, request(store, 2, moved.inverse, { etags })));
  assert.equal(undone.merged, true);
  assert.equal(read(store, 2, HERO), go(HERO_TSX));
});

test('a move whose anchor Claude deleted is a conflict gone, and no byte is written', async () => {
  const { store, deps, written } = setup();
  const etags = etagsOf(store, 1);
  const claude = HERO_TSX.replace(BUTTON_LINE, '');
  store.writeText('shop', `v1/${HERO}`, claude);
  const before = snapshot(store);
  const op: EditOp = { op: 'moveElement', id: FIRST, anchor: BUTTON, place: 'after' };
  const result = await applyEdits(deps, request(store, 1, [op], { etags }));
  assert.deepEqual(result, {
    outcome: 'conflict',
    version: 1,
    index: 0,
    reason: 'gone',
    file: HERO,
    text: claude,
    etag: etagOf(claude),
  });
  assert.deepEqual(snapshot(store), before);
  assert.deepEqual(written, []);
});

test('a refused structural op leaves every file and draft.json as they were', async () => {
  const { store, deps, written } = setup();
  const before = snapshot(store);
  const ops: EditOp[] = [SWAP, { op: 'removeElement', id: 'sections/Hero:section' }];
  const result = await applyEdits(deps, request(store, 1, ops));
  assert.deepEqual(result, {
    outcome: 'refused',
    version: 1,
    refusals: [{ index: 1, reason: 'section-root' }],
  });
  assert.deepEqual(snapshot(store), before);
  assert.deepEqual(written, []);
});

test('a removed section comes back with its files and its layout block from the inverse', async () => {
  const { store, deps } = setup();
  const op: EditOp = { op: 'removeSection', section: 'footer' };
  const removed = applied(await applyEdits(deps, request(store, 1, [op])));
  assert.equal(store.readText('shop', `v2/${FOOTER}`), undefined);
  assert.equal(store.readText('shop', `v2/${FOOTER_SCSS}`), undefined);
  assert.ok(!read(store, 2, LAYOUT).includes('## footer'), read(store, 2, LAYOUT));
  assert.equal(read(store, 2, HERO), HERO_TSX);
  // A removed file has no ETag; its inverse writes it back whole.
  assert.deepEqual(Object.keys(removed.etags), [LAYOUT]);
  const kinds = removed.inverse.map((each) => `${each.op} ${'file' in each ? each.file : ''}`);
  assert.deepEqual(kinds.sort(), [`file ${FOOTER_SCSS}`, `file ${FOOTER}`, `patch ${LAYOUT}`]);

  const restored = applied(await applyEdits(deps, request(store, 2, removed.inverse)));
  assert.deepEqual(filesOf(store, 2), filesOf(store, 1));
  assert.deepEqual(restored.created, ['sections/Footer:footer']);
});
