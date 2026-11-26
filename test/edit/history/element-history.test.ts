import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  addVersion,
  appendRenames,
  type DraftStore,
  serializeJson,
  startEditSession,
} from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { elementHistory } from '../../../src/edit/app/history/element-history.ts';
import { elementIds, idsFile, readSites } from '../../../src/render/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { shopDraft, writeVersionFiles } from '../../helpers/draft/drafts.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const LATER = new Date('2026-11-24T09:00:00.000Z');
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

const CARD = ['<Card>', '  <Text>In card</Text>', '</Card>'];
const V1 = hero(['<Text>One</Text>', '<Text>Two</Text>', ...CARD]);
/** The editor's session: Two moved before One and reworded, a Badge inserted. */
const V2 = hero([
  '<Text>Two, changed</Text>',
  '<Text>One</Text>',
  '<Card>',
  '  <Text>In card</Text>',
  '</Card>',
  '<Badge>New</Badge>',
]);
/** Claude's version: a new first line, so every Text id moved without a log. */
const V3 = hero([
  '<Text>Intro</Text>',
  '<Text>Two, changed</Text>',
  '<Text>One</Text>',
  '<Card>',
  '  <Text>In card</Text>',
  '</Card>',
  '<Badge>New</Badge>',
]);

/** The version's `build/json/ids.json`, as the build writes it from the text it has now. */
async function build(store: DraftStore, version: number): Promise<void> {
  const text = store.readText('shop', `v${version}/${HERO}`) ?? '';
  const code = await compiler.jsxDev(text, HERO);
  const sites = code === null ? undefined : readSites(code);
  assert.ok(sites, 'the fixture compiles');
  const ids = serializeJson(idsFile(elementIds(HERO, sites)));
  store.writeText('shop', `v${version}/build/json/ids.json`, ids);
}

/** v1, then the editor's session in v2 with its rename log; `built`: the versions with a build. */
async function edited(built: number[] = [1, 2]): Promise<DraftStore> {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, { [HERO]: V1 });
  assert.equal(startEditSession(store, 'shop', LATER), 2);
  writeVersionFiles(store, 'shop', 2, { [HERO]: V2 });
  const at = LATER.toISOString();
  appendRenames(store, 'shop', 2, {
    at,
    renames: { [`${STACK}/Text`]: `${STACK}/Text.2`, [`${STACK}/Text.2`]: `${STACK}/Text` },
    created: [],
  });
  appendRenames(store, 'shop', 2, { at, renames: {}, created: [`${STACK}/Badge`] });
  for (const version of built) await build(store, version);
  return store;
}

/** `edited`, then a third version Claude wrote, with no log. */
async function rewritten(): Promise<DraftStore> {
  const store = await edited();
  assert.equal(addVersion(store, 'shop', LATER).version, 3);
  writeVersionFiles(store, 'shop', 3, { [HERO]: V3 });
  await build(store, 3);
  return store;
}

const history = (store: DraftStore, id: string) =>
  elementHistory({ drafts: store, compiler }, 'shop', id);

test('an element the editor moved is followed back through the rename log', async () => {
  const store = await edited();
  assert.deepEqual(await history(store, `${STACK}/Text.2`), {
    id: `${STACK}/Text.2`,
    steps: [
      { version: 1, id: `${STACK}/Text`, changed: false, unsure: false },
      { version: 2, id: `${STACK}/Text.2`, changed: false, unsure: false },
    ],
  });
});

test('an element the editor moved and reworded is marked as changed in that version', async () => {
  const store = await edited();
  assert.deepEqual((await history(store, `${STACK}/Text`)).steps, [
    { version: 1, id: `${STACK}/Text.2`, changed: false, unsure: false },
    { version: 2, id: `${STACK}/Text`, changed: true, unsure: false },
  ]);
});

test('an element that only got new indentation is not changed', async () => {
  const store = await edited();
  const deeper = V2.replace('          <Text>In card</Text>', '              <Text>In card</Text>');
  writeVersionFiles(store, 'shop', 2, { [HERO]: deeper });
  await build(store, 2);
  const steps = (await history(store, `${STACK}/Card`)).steps;
  assert.deepEqual(
    steps.map((step) => step.changed),
    [false, false],
  );
});

test('an element created later was not in the versions before', async () => {
  const store = await edited();
  assert.deepEqual((await history(store, `${STACK}/Badge`)).steps, [
    { version: 1, id: null, changed: false, unsure: false },
    { version: 2, id: `${STACK}/Badge`, changed: true, unsure: false },
  ]);
});

test('after a rewrite by Claude the element is matched by its source, and unsure', async () => {
  const store = await rewritten();
  // No log in v3: `Text.3` names nothing in v2, where the same line is `Text.2`.
  assert.deepEqual((await history(store, `${STACK}/Text.3`)).steps, [
    { version: 1, id: `${STACK}/Text`, changed: false, unsure: true },
    { version: 2, id: `${STACK}/Text.2`, changed: false, unsure: true },
    { version: 3, id: `${STACK}/Text.3`, changed: false, unsure: false },
  ]);
});

test('an id that names another element after a rewrite gives way to the equal source', async () => {
  const store = await rewritten();
  // `Text.2` is "One" in v2 and "Two, changed" in v3; the equal source in v2 is `Text`.
  assert.deepEqual((await history(store, `${STACK}/Text.2`)).steps, [
    { version: 1, id: `${STACK}/Text.2`, changed: false, unsure: true },
    { version: 2, id: `${STACK}/Text`, changed: true, unsure: true },
    { version: 3, id: `${STACK}/Text.2`, changed: false, unsure: false },
  ]);
});

test('an element with the same id and no equal source elsewhere was edited in place', async () => {
  const store = await rewritten();
  // "Intro" took the id of "Two, changed": the id still names an element, so it is believed.
  assert.deepEqual((await history(store, `${STACK}/Text`)).steps.slice(1), [
    { version: 2, id: `${STACK}/Text`, changed: true, unsure: false },
    { version: 3, id: `${STACK}/Text`, changed: true, unsure: false },
  ]);
});

test('a version without a build answers from its source alone, as unsure', async () => {
  const store = await edited([2]);
  assert.deepEqual((await history(store, `${STACK}/Text.2`)).steps, [
    { version: 1, id: `${STACK}/Text`, changed: false, unsure: true },
    { version: 2, id: `${STACK}/Text.2`, changed: false, unsure: false },
  ]);
});

test('a build of another text is not believed: the source is compiled instead', async () => {
  const store = await edited();
  // The file changed after the build: `ids.json` points at the old lines.
  writeVersionFiles(store, 'shop', 1, { [HERO]: V1.replace("'@kit';\n", "'@kit';\n\n// Hero\n") });
  const steps = (await history(store, `${STACK}/Text.2`)).steps;
  assert.deepEqual(steps[0], { version: 1, id: `${STACK}/Text`, changed: false, unsure: true });
});

test('a version whose file does not compile and has no build has no element', async () => {
  const store = await edited([2]);
  writeVersionFiles(store, 'shop', 1, { [HERO]: V1.replace('    </section>', '    </div>') });
  assert.deepEqual((await history(store, `${STACK}/Text.2`)).steps[0], {
    version: 1,
    id: null,
    changed: false,
    unsure: false,
  });
});

test('an id the latest version does not have is EDIT_ELEMENT_NOT_FOUND', async () => {
  const store = await edited();
  await assert.rejects(
    history(store, `${STACK}/Heading`),
    (error) => error instanceof KitvasError && error.code === 'EDIT_ELEMENT_NOT_FOUND',
  );
});
