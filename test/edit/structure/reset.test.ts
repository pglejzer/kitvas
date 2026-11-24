import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  appendRenames,
  type DraftStore,
  loadDraft,
  serializeJson,
  startEditSession,
} from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { resolveReset } from '../../../src/edit/app/structure/reset.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { shopDraft, writeVersionFiles } from '../../helpers/drafts.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const LATER = new Date('2026-11-23T09:00:00.000Z');
const HERO = 'src/tsx/sections/Hero.tsx';
const STACK = 'sections/Hero:section/Stack';

function hero(children: string[]): string {
  return [
    "import { Badge, Card, Stack, Text } from '@kit';",
    '',
    'export function Hero() {',
    '  return (',
    '    <section>',
    '      <Stack>',
    ...children.map((line) => `        ${line}`),
    '      </Stack>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
}

const START = hero([
  '<Text>One</Text>',
  '<Text>Two</Text>',
  '<Card>',
  '  <Text>In card</Text>',
  '</Card>',
]);

/**
 * The session's text: Two moved before One and its words changed, the card's text changed, a
 * Badge inserted (all three in the log), and a note Claude added (not in the log).
 */
const EDITED = hero([
  '<Text>Two, changed</Text>',
  '<Text>One</Text>',
  '<Card>',
  '  <Text>Changed</Text>',
  '</Card>',
  '<Badge>New</Badge>',
  '<p>A note</p>',
]);

/** The `shop` draft with START in v1 and a session in v2 that made EDITED. */
function session(): DraftStore {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, { [HERO]: START });
  assert.equal(startEditSession(store, 'shop', LATER), 2);
  writeVersionFiles(store, 'shop', 2, { [HERO]: EDITED });
  const at = LATER.toISOString();
  appendRenames(store, 'shop', 2, {
    at,
    renames: { [`${STACK}/Text`]: `${STACK}/Text.2`, [`${STACK}/Text.2`]: `${STACK}/Text` },
    created: [],
  });
  appendRenames(store, 'shop', 2, { at, renames: {}, created: [] });
  appendRenames(store, 'shop', 2, { at, renames: {}, created: [`${STACK}/Badge`] });
  return store;
}

const reset = (store: DraftStore, id: string, version = 2) =>
  resolveReset({ drafts: store, compiler }, 'shop', version, id);

test('reset finds a moved element by its id at the start of the session', async () => {
  const store = session();
  assert.deepEqual(await reset(store, `${STACK}/Text`), { source: '<Text>Two</Text>' });
  assert.deepEqual(await reset(store, `${STACK}/Text.2`), { source: '<Text>One</Text>' });
});

test('reset gives a multi-line element whole, as it was written', async () => {
  const store = session();
  assert.deepEqual(await reset(store, `${STACK}/Card`), {
    source: ['<Card>', '          <Text>In card</Text>', '        </Card>'].join('\n'),
  });
  assert.deepEqual(await reset(store, `${STACK}/Card/Text`), { source: '<Text>In card</Text>' });
});

test('an element created in the session is not-in-session', async () => {
  const store = session();
  assert.deepEqual(await reset(store, `${STACK}/Badge`), { refused: 'not-in-session' });
});

test('an element another writer added outside the log is not-in-session', async () => {
  const store = session();
  assert.deepEqual(await reset(store, `${STACK}/p`), { refused: 'not-in-session' });
});

test('an element of a file the session added is not-in-session', async () => {
  const store = session();
  const extra = 'src/tsx/sections/Extra.tsx';
  writeVersionFiles(store, 'shop', 2, {
    [extra]: 'export function Extra() {\n  return <section>Extra</section>;\n}\n',
  });
  assert.deepEqual(await reset(store, 'sections/Extra:section'), { refused: 'not-in-session' });
});

test('without an open session the latest version is the start, its log unread', async () => {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, { [HERO]: START });
  // A log left by an ended session in v1 does not apply to the next session.
  appendRenames(store, 'shop', 1, {
    at: LATER.toISOString(),
    renames: { [`${STACK}/Text`]: `${STACK}/Text.2`, [`${STACK}/Text.2`]: `${STACK}/Text` },
    created: [],
  });
  assert.deepEqual(await reset(store, `${STACK}/Text`, 1), { source: '<Text>One</Text>' });
});

test('a session open in the first version has no start to reset to', async () => {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, { [HERO]: START });
  const edit = { version: 1, startedAt: LATER.toISOString() };
  store.writeText('shop', 'draft.json', serializeJson({ ...loadDraft(store, 'shop'), edit }));
  assert.deepEqual(await reset(store, `${STACK}/Text`, 1), { refused: 'not-in-session' });
});

test('a start text that does not compile gives not-found', async () => {
  const store = session();
  writeVersionFiles(store, 'shop', 1, { [HERO]: START.replace('    </section>', '    </div>') });
  assert.deepEqual(await reset(store, `${STACK}/Text`), { refused: 'not-found' });
});
