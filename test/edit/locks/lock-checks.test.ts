import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore, newLock, saveView } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditOp,
  type EditResult,
  hashOf,
  sectionScss,
} from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts, writeVersionFiles } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'kitvas-ui', version: '1.0.0', hash: 'b'.repeat(64) };
const LAYOUT = 'md/layout.md';
const HERO = 'src/tsx/sections/Hero.tsx';
const HERO_SCSS = 'src/scss/sections/hero.scss';
const FILES = [LAYOUT, HERO, HERO_SCSS];

const LAYOUT_MD = [
  '# Layout: Shop',
  '',
  '## hero',
  'Purpose: Say what the shop sells.',
  'Components: Stack, Text, Badge, Button',
  '',
].join('\n');

const BADGE_SOURCE = '<Badge className="promo">New</Badge>';
const HERO_TSX = [
  "import { Badge, Button, Stack, Text } from '@kit';",
  '',
  'export function Hero() {',
  '  return (',
  '    <section className="hero">',
  '      <Stack gap="12">',
  '        <Text>First</Text>',
  '        <Text>Second</Text>',
  `        ${BADGE_SOURCE}`,
  '        <Button>Go</Button>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const HERO_SCSS_TEXT =
  '.hero {\n  padding: var(--kit-space-16);\n}\n\n.promo {\n  color: red;\n}\n';

const SECTION = 'sections/Hero:section';
const STACK = `${SECTION}/Stack`;
const FIRST = `${STACK}/Text`;
const SECOND = `${STACK}/Text.2`;
const BADGE = `${STACK}/Badge`;
const BUTTON = `${STACK}/Button`;

/** The `shop` draft on the kitvas UI kit with its Badge locked. */
function setup(): { store: DraftStore; deps: ApplyEditsDeps } {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  writeVersionFiles(store, 'shop', 1, {
    [LAYOUT]: LAYOUT_MD,
    [HERO]: HERO_TSX,
    [HERO_SCSS]: HERO_SCSS_TEXT,
  });
  const stamp = { version: 1, at: '2026-11-24T08:00:00.000Z' };
  saveView(store, 'shop', { latest: 1, locked: [newLock(BADGE, BADGE_SOURCE, stamp)], hidden: [] });
  const deps: ApplyEditsDeps = {
    drafts: store,
    compiler,
    kits: builtinKits(),
    now: () => new Date('2026-11-24T09:00:00.000Z'),
    etag: etagOf,
    sectionScss: (slug, version, file) => sectionScss(store, slug, version, file),
  };
  return { store, deps };
}

const etagsOf = (store: DraftStore): Record<string, string> =>
  Object.fromEntries(
    FILES.flatMap((file): [string, string][] => {
      const text = store.readText('shop', `v1/${file}`);
      return text === undefined ? [] : [[file, etagOf(text)]];
    }),
  );

async function run(op: EditOp): Promise<{ result: EditResult; store: DraftStore }> {
  const { store, deps } = setup();
  const result = await applyEdits(deps, {
    slug: 'shop',
    version: 1,
    ops: [op],
    etags: etagsOf(store),
  });
  return { result, store };
}

const lockedOut = (result: EditResult): boolean =>
  result.outcome === 'refused' && result.refusals.some((one) => one.reason === 'locked');

const text = (id: string, value: string, before: string): EditOp => ({
  op: 'setText',
  id,
  value,
  before,
});

const refused: [string, EditOp][] = [
  ['the text of the locked element', text(BADGE, 'Old', 'New')],
  [
    'a prop of the locked element',
    {
      op: 'setProp',
      id: BADGE,
      name: 'tone',
      value: { kind: 'string', value: 'info' },
      before: null,
      after: null,
    },
  ],
  [
    'a class rule the locked element carries',
    {
      op: 'setStyle',
      id: FIRST,
      className: 'promo',
      property: 'color',
      value: { raw: 'blue' },
      before: null,
      newRule: false,
    },
  ],
  ['deleting it', { op: 'removeElement', id: BADGE }],
  ['deleting its parent', { op: 'removeElement', id: STACK }],
  ['resetting it', { op: 'resetElement', id: BADGE }],
  ['replacing its tag', { op: 'replaceTag', id: BADGE, tag: 'Button' }],
  ['pasting over it', { op: 'replaceElement', id: BADGE, source: '<Badge>Sale</Badge>' }],
  [
    'pasting over its parent without it',
    { op: 'replaceElement', id: STACK, source: '<Stack gap="12"><Text>Only</Text></Stack>' },
  ],
  [
    'wrapping it with a sibling',
    { op: 'wrapElements', first: SECOND, last: BADGE, open: '<Stack>' },
  ],
  ['unwrapping it', { op: 'unwrapElement', id: BADGE }],
  [
    'adding a child into it',
    { op: 'insertElement', anchor: BADGE, place: 'last', source: '<Text>x</Text>' },
  ],
  ['deleting its section', { op: 'removeSection', section: 'hero' }],
];

for (const [what, op] of refused) {
  test(`a lock refuses ${what}`, async () => {
    const { result } = await run(op);
    assert.ok(lockedOut(result), JSON.stringify(result));
  });
}

const allowed: [string, EditOp][] = [
  ['the text of a sibling', text(FIRST, 'One', 'First')],
  ['deleting a sibling', { op: 'removeElement', id: BUTTON }],
  [
    'moving the locked element itself',
    { op: 'moveElement', id: BADGE, anchor: FIRST, place: 'before' },
  ],
  ['moving a sibling next to it', { op: 'moveElement', id: FIRST, anchor: BADGE, place: 'after' }],
  [
    'adding an element beside it',
    { op: 'insertElement', anchor: BADGE, place: 'before', source: '<Text>x</Text>' },
  ],
  ['wrapping its parent', { op: 'wrapElements', first: STACK, last: STACK, open: '<Stack>' }],
  ['unwrapping its parent', { op: 'unwrapElement', id: STACK }],
  [
    'an undo step that writes it',
    { op: 'patch', file: HERO, hunks: [{ find: '>New</Badge>', replace: '>Old</Badge>' }] },
  ],
];

for (const [what, op] of allowed) {
  test(`a lock allows ${what}`, async () => {
    const { result } = await run(op);
    assert.ok(!lockedOut(result), JSON.stringify(result));
  });
}

test('the Restore paste of a locked element goes through, with the source its lock keeps', async () => {
  const { result } = await run({
    op: 'replaceElement',
    id: BADGE,
    source: BADGE_SOURCE,
    hash: hashOf(BADGE_SOURCE),
  });
  assert.ok(!lockedOut(result), JSON.stringify(result));
});

test('a draft without locks refuses nothing for a lock', async () => {
  const { store, deps } = setup();
  store.writeText('shop', 'view.json', '');
  const op: EditOp = { op: 'removeElement', id: BADGE };
  const result = await applyEdits(deps, {
    slug: 'shop',
    version: 1,
    ops: [op],
    etags: etagsOf(store),
  });
  assert.equal(lockedOut(result), false);
});
