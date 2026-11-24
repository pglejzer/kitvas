import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { addVersion, createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { type RestorePreview, restorePreview } from '../../../src/edit/app/history/restore.ts';
import { hashOf } from '../../../src/edit/domain/ops.ts';
import {
  type ApplyEditsDeps,
  applyEdits,
  type EditOp,
  type EditResult,
  sectionScss,
} from '../../../src/edit/index.ts';
import { KitvasError, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts, writeVersionFiles } from '../../helpers/drafts.ts';
import { builtinKits } from '../../helpers/kits.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const LATER = new Date('2026-11-24T09:00:00.000Z');
const HERO = 'src/tsx/sections/Hero.tsx';
const BUTTON = 'sections/Hero:section/Stack/Button';

/** A hero whose only Button is `button`; `top`: lines between the import and the component. */
function hero(names: string, button: string, top: string[] = []): string {
  return [
    `import { ${names} } from '@kit';`,
    '',
    ...top,
    'export function Hero() {',
    '  return (',
    '    <section>',
    '      <Stack>',
    '        <Text>One</Text>',
    `        ${button}`,
    '      </Stack>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
}

const WITH_BADGE = '<Button><Badge>New</Badge> Go</Button>';
const PLAIN = '<Button>Go</Button>';
const LABEL = ["const label = 'Go';", ''];

/** The `shop` draft on the Base kit: `old` is v1, `now` is v2 as another writer left it. */
function setup(old: string, now: string) {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  writeVersionFiles(store, 'shop', 1, { [HERO]: old });
  assert.equal(addVersion(store, 'shop', LATER).version, 2);
  writeVersionFiles(store, 'shop', 2, { [HERO]: now });
  const kits = builtinKits();
  const deps: ApplyEditsDeps = {
    drafts: store,
    compiler,
    kits,
    now: () => LATER,
    etag: etagOf,
    sectionScss: (slug, version, file) => sectionScss(store, slug, version, file),
    beforeWrite: () => {},
  };
  const preview = (version = 1, id = BUTTON): Promise<RestorePreview> =>
    restorePreview({ drafts: store, kits, compiler }, 'shop', { id, version });
  return { store, deps, preview };
}

const read = (store: DraftStore, version: number): string =>
  store.readText('shop', `v${version}/${HERO}`) ?? '';

const apply = (deps: ApplyEditsDeps, store: DraftStore, version: number, ops: EditOp[]) =>
  applyEdits(deps, {
    slug: 'shop',
    version,
    ops,
    etags: { [HERO]: etagOf(read(store, version)) },
  });

function applied(result: EditResult): Extract<EditResult, { outcome: 'applied' }> {
  assert.equal(result.outcome, 'applied', JSON.stringify(result));
  if (result.outcome !== 'applied') throw new Error('not applied');
  return result;
}

const coded = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('the preview shows both sources and one replaceElement, naming the import it adds', async () => {
  const old = hero('Badge, Button, Stack, Text', WITH_BADGE);
  const { preview } = setup(old, hero('Button, Stack, Text', PLAIN));
  assert.deepEqual(await preview(), {
    file: HERO,
    old: WITH_BADGE,
    current: PLAIN,
    missing: [],
    imports: ['Badge'],
    ops: [{ op: 'replaceElement', id: BUTTON, source: WITH_BADGE, hash: hashOf(PLAIN) }],
  });
});

test('accepting adds the kit import, and the inverse gives the file back byte for byte', async () => {
  const old = hero('Badge, Button, Stack, Text', WITH_BADGE);
  const now = hero('Button, Stack, Text', PLAIN);
  const { store, deps, preview } = setup(old, now);
  const ops = (await preview()).ops;
  assert.ok(ops);
  const result = applied(await apply(deps, store, 2, ops));
  assert.equal(result.version, 3);
  // The element and the import line are as they were in version 1: the whole file is.
  assert.equal(read(store, 3), old);
  applied(await apply(deps, store, 3, result.inverse));
  assert.equal(read(store, 3), now);
});

test('a multi-line element comes back at the margin, and is written at its place', async () => {
  const card = ['<Button>', '          <Badge>New</Badge>', '        </Button>'].join('\n');
  const old = hero('Badge, Button, Stack, Text', card);
  const { store, deps, preview } = setup(old, hero('Button, Stack, Text', PLAIN));
  const answer = await preview();
  assert.equal(answer.old, ['<Button>', '  <Badge>New</Badge>', '</Button>'].join('\n'));
  assert.ok(answer.ops);
  applied(await apply(deps, store, 2, answer.ops));
  assert.equal(read(store, 3), old);
});

test('a variable the current file no longer has is named, and nothing is offered', async () => {
  const old = hero('Button, Stack, Text', '<Button>{label}</Button>', LABEL);
  const { preview } = setup(old, hero('Button, Stack, Text', PLAIN));
  const answer = await preview();
  assert.deepEqual(answer.missing, ['label']);
  assert.equal(answer.ops, null);
  assert.equal(answer.old, '<Button>{label}</Button>');
});

test('a variable the current file still has is no obstacle, and the edit applies', async () => {
  const names = 'Button, Stack, Text';
  const old = hero(names, '<Button>{label}</Button>', LABEL);
  const { store, deps, preview } = setup(old, hero(names, PLAIN, LABEL));
  const answer = await preview();
  assert.deepEqual([answer.missing, answer.imports], [[], []]);
  assert.ok(answer.ops);
  applied(await apply(deps, store, 2, answer.ops));
  assert.equal(read(store, 3), old);
});

test('replaceElement still refuses a source that reads a name the file lacks', async () => {
  const now = hero('Button, Stack, Text', PLAIN);
  const { store, deps } = setup(now, now);
  const op: EditOp = {
    op: 'replaceElement',
    id: BUTTON,
    source: '<Button>{label}</Button>',
    hash: hashOf(PLAIN),
  };
  const result = await apply(deps, store, 2, [op]);
  assert.equal(result.outcome, 'refused', JSON.stringify(result));
  assert.equal(read(store, 2), now);
  assert.equal(store.readText('shop', `v3/${HERO}`), undefined);
});

test('a prop the kit does not have is named as missing', async () => {
  const names = 'Button, Stack, Text';
  const { preview } = setup(hero(names, '<Button glow="soft">Go</Button>'), hero(names, PLAIN));
  const answer = await preview();
  assert.deepEqual(answer.missing, ['glow (a prop of Button)']);
  assert.equal(answer.ops, null);
});

test('an element that was not in that version, or a version the draft lacks, is an error', async () => {
  const names = 'Button, Stack, Text';
  const without = hero(names, '<Text>Two</Text>');
  const { preview } = setup(without, hero(names, PLAIN));
  await assert.rejects(preview(1), coded('EDIT_ELEMENT_NOT_FOUND'));
  await assert.rejects(preview(9), coded('VERSION_NOT_FOUND'));
  await assert.rejects(preview(1, `${BUTTON}.4`), coded('EDIT_ELEMENT_NOT_FOUND'));
});
