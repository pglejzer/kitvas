import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addVersion, createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import type { EditDeps } from '../../../src/studio/api/edit/edit-routes.ts';
import type {
  EditEnd,
  EditOutcome,
  EditState,
  Inspect,
  OffKit,
  TextSource,
} from '../../../src/studio/api/edit/edit-schemas.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts } from '../../helpers/draft/drafts.ts';
import { call, studioOver } from '../../helpers/studio/studio.ts';

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };
const TSX_FILE = 'src/tsx/sections/Pricing.tsx';
const SCSS_FILE = 'src/scss/sections/pricing.scss';
const STACK = 'sections/Pricing:section/Stack';

const PRICING_TSX = [
  "import { Stack, Text } from '@kit';",
  '',
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="md">',
  '        <Text>Plans</Text>',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const PRICING_SCSS = '.pricing {\n  margin: 13px; /* off-kit */\n}\n';
const LAYOUT = '# Layout: Shop\n\n## pricing\nPurpose: Show the plans.\nComponents: Stack, Text\n';

type Problem = { code: string; errors?: { pointer: string; detail: string }[] };
type Written = { slug: string; version: number; etags: Record<string, string> };

const json = <T>(text: string): T => JSON.parse(text) as T;

/** The `shop` draft on the Base kit with one section, `pricing`. */
function pricingDrafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  store.writeText('shop', 'v1/md/layout.md', LAYOUT);
  store.writeText('shop', `v1/${TSX_FILE}`, PRICING_TSX);
  store.writeText('shop', `v1/${SCSS_FILE}`, PRICING_SCSS);
  return store;
}

/** A studio over the pricing draft with the real compiler; the write hooks are recorded. */
async function editStudio(withEditor = true) {
  const drafts = pricingDrafts();
  const before: Written[] = [];
  const after: Written[] = [];
  const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
  const edit: EditDeps = {
    compiler,
    // The studio stops esbuild when it closes.
    dispose: () => compiler.dispose(),
    beforeWrite: (slug, version, etags) => {
      before.push({ slug, version, etags });
    },
    afterWrite: (slug, version, etags) => {
      after.push({ slug, version, etags });
    },
  };
  const { studio, errors } = await studioOver(drafts, {}, withEditor ? { edit } : {});
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const get = (path: string) => call(studio.port, { path, headers: auth });
  const post = (path: string, body: unknown, headers: Record<string, string> = write) =>
    call(studio.port, { method: 'POST', path, headers, body: JSON.stringify(body) });
  return { drafts, studio, errors, before, after, auth, get, post };
}

/** `gap` of the Stack from `from` to `to`. */
const setGap = (to: string, from: string) => ({
  op: 'setProp',
  id: STACK,
  name: 'gap',
  value: { kind: 'string', value: to },
  before: { kind: 'string', value: from },
  after: null,
});

const EDITS = '/api/v1/drafts/shop/edits';

test("the edit state names the version, the session, the files' ETags and the tokens", async () => {
  const { studio, errors, get } = await editStudio();
  try {
    const answer = await get(EDITS);
    assert.equal(answer.status, 200, answer.text);
    const state = json<EditState>(answer.text);
    assert.equal(state.slug, 'shop');
    assert.equal(state.version, 1);
    assert.equal(state.session, null);
    assert.equal(state.format, 'scss');
    assert.deepEqual(state.etags, {
      [SCSS_FILE]: etagOf(PRICING_SCSS),
      [TSX_FILE]: etagOf(PRICING_TSX),
    });
    assert.deepEqual(
      state.tokens.find((token) => token.var === '--kit-space-md'),
      { var: '--kit-space-md', path: 'space.md', type: 'dimension', css: '12px' },
    );
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('inspect answers one element as written; an id that names no element is refused', async () => {
  const { studio, errors, get } = await editStudio();
  try {
    const answer = await get(`/api/v1/drafts/shop/inspect?id=${encodeURIComponent(STACK)}`);
    assert.equal(answer.status, 200, answer.text);
    const stack = json<Inspect>(answer.text);
    assert.equal(stack.tag, 'Stack');
    assert.equal(stack.file, TSX_FILE);
    assert.equal(stack.etag, etagOf(PRICING_TSX));
    assert.deepEqual(stack.styles.gap, { kind: 'prop', prop: 'gap' });
    for (const query of ['', '?id=', '?id=nope', `?id=${encodeURIComponent('../x:div')}`]) {
      const bad = await get(`/api/v1/drafts/shop/inspect${query}`);
      assert.equal(bad.status, 400, query);
      assert.equal(json<Problem>(bad.text).code, 'REQUEST_INVALID', query);
    }
    const gone = await get(`/api/v1/drafts/shop/inspect?id=${encodeURIComponent(`${STACK}/Grid`)}`);
    assert.equal(gone.status, 404);
    assert.equal(json<Problem>(gone.text).code, 'EDIT_ELEMENT_NOT_FOUND');
    // A copy's path is numbers with commas (ADR 0065); an element in no list answers no list.
    const one = `/api/v1/drafts/shop/inspect?id=${encodeURIComponent(STACK)}`;
    for (const path of ['', '0', '0,2']) {
      const copy = await get(`${one}&path=${path}`);
      assert.equal(copy.status, 200, path);
      assert.equal(json<Inspect>(copy.text).list ?? null, null, path);
    }
    for (const path of ['a', '0,', '-1', '0;1', '0,1,2,3,4,5,6,7,8']) {
      const bad = await get(`${one}&path=${encodeURIComponent(path)}`);
      assert.equal(bad.status, 400, path);
    }
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('scope without a path is refused', async () => {
  const { studio, errors, get } = await editStudio();
  try {
    const one = `/api/v1/drafts/shop/inspect?id=${encodeURIComponent(STACK)}`;
    // ADR 0072: the copy names the item, so `scope=item` needs a `path`; no other scope is known.
    for (const query of ['&scope=item', '&scope=all&path=0', '&scope=']) {
      const bad = await get(`${one}${query}`);
      assert.equal(bad.status, 400, query);
      assert.equal(json<Problem>(bad.text).code, 'REQUEST_INVALID', query);
    }
    // With a path the answer says why the Stack, in no list, has no item of its own.
    const asked = await get(`${one}&scope=item&path=`);
    assert.equal(asked.status, 200, asked.text);
    assert.deepEqual(json<Inspect>(asked.text).itemScope, { refused: 'not-list-item' });
    assert.equal(json<Inspect>((await get(one)).text).itemScope, null);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the first edit starts a version, the next goes into it, and saving ends it', async () => {
  const { drafts, studio, errors, before, after, get, post } = await editStudio();
  try {
    const first = await post(EDITS, {
      version: 1,
      ops: [setGap('lg', 'md')],
      etags: { [TSX_FILE]: etagOf(PRICING_TSX) },
    });
    assert.equal(first.status, 200, first.text);
    const v2 = drafts.readText('shop', `v2/${TSX_FILE}`) ?? '';
    assert.equal(v2, PRICING_TSX.replace('gap="md"', 'gap="lg"'));
    assert.equal(drafts.readText('shop', `v1/${TSX_FILE}`), PRICING_TSX, 'v1 is kept');
    const etags = { [TSX_FILE]: etagOf(v2) };
    assert.deepEqual(json<EditOutcome>(first.text), {
      outcome: 'applied',
      version: 2,
      started: true,
      etags,
      merged: false,
      // Spec 4b: the exact inverse, and no renames for a prop edit.
      inverse: [
        {
          op: 'setProp',
          id: STACK,
          name: 'gap',
          value: { kind: 'string', value: 'md' },
          before: { kind: 'string', value: 'lg' },
          after: null,
        },
      ],
      renames: {},
      created: [],
      dropped: [],
      // Spec 4c: the code findings of the files it wrote; the Stack and the Text are the kit's.
      live: [],
    });
    // The live loop hears of the write after it with the ETags it made, and before it also of
    // the files the new version copied, so none of them is taken for someone else's change.
    assert.deepEqual(after, [{ slug: 'shop', version: 2, etags }]);
    assert.deepEqual(before, [
      { slug: 'shop', version: 2, etags: { ...etags, [SCSS_FILE]: etagOf(PRICING_SCSS) } },
    ]);

    const open = json<EditState>((await get(EDITS)).text);
    assert.equal(open.version, 2);
    assert.equal(open.session?.version, 2);

    const second = await post(EDITS, { version: 2, ops: [setGap('xl', 'lg')], etags });
    assert.equal(second.status, 200, second.text);
    const outcome = json<EditOutcome>(second.text);
    assert.equal(outcome.outcome, 'applied');
    assert.equal(outcome.version, 2);
    assert.equal(outcome.outcome === 'applied' && outcome.started, false);
    assert.match(drafts.readText('shop', `v2/${TSX_FILE}`) ?? '', /<Stack gap="xl">/);
    assert.equal(drafts.exists('shop', 'v3'), false);
    // A later edit names only the file it writes.
    assert.deepEqual(Object.keys(before[1]?.etags ?? {}), [TSX_FILE]);

    const ended = await post(`${EDITS}/end`, {});
    assert.equal(ended.status, 200, ended.text);
    assert.deepEqual(json<EditEnd>(ended.text), { version: 2, ended: true });
    assert.equal(json<EditState>((await get(EDITS)).text).session, null);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an applied edit answers the worded code findings of the files it wrote', async () => {
  const { studio, errors, post } = await editStudio();
  try {
    const section = 'sections/Pricing:section';
    const answer = await post(EDITS, {
      version: 1,
      ops: [
        {
          op: 'setStyle',
          id: section,
          className: 'pricing',
          property: 'color',
          value: { raw: '#ff0000' },
          before: null,
          newRule: false,
        },
      ],
      etags: { [TSX_FILE]: etagOf(PRICING_TSX), [SCSS_FILE]: etagOf(PRICING_SCSS) },
    });
    assert.equal(answer.status, 200, answer.text);
    const outcome = json<EditOutcome>(answer.text);
    assert.equal(outcome.outcome, 'applied');
    const live = outcome.outcome === 'applied' ? (outcome.live ?? []) : [];
    // The sheet's 13px margin is off the kit's scale; the new colour is typed by hand. Both sit in
    // the rule of the class the edit wrote, so they are about its element.
    assert.deepEqual(
      live.map(({ rule, severity, file, element }) => ({ rule, severity, file, element })),
      [
        { rule: 'ds/raw-size', severity: 'review', file: SCSS_FILE, element: section },
        { rule: 'ds/raw-color', severity: 'fix', file: SCSS_FILE, element: section },
      ],
    );
    for (const finding of live) {
      assert.ok(finding.line > 1, finding.message);
      assert.ok(!finding.message.startsWith('checkRule.'), 'worded, not a key');
    }
    assert.match(live[1]?.message ?? '', /#ff0000/);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a refused edit answers no live findings', async () => {
  const { studio, post } = await editStudio();
  try {
    const answer = await post(EDITS, {
      version: 1,
      ops: [{ ...setGap('lg', 'md'), id: `${STACK}/Grid` }],
      etags: { [TSX_FILE]: etagOf(PRICING_TSX) },
    });
    assert.equal(answer.status, 200, answer.text);
    const outcome = json<Record<string, unknown>>(answer.text);
    assert.notEqual(outcome.outcome, 'applied');
    assert.equal('live' in outcome, false);
  } finally {
    await studio.close();
  }
});

test('Undo save reopens the ended session only while its version is the latest', async () => {
  const { drafts, studio, errors, get, post, auth } = await editStudio();
  try {
    const etags = { [TSX_FILE]: etagOf(PRICING_TSX) };
    assert.equal((await post(EDITS, { version: 1, ops: [setGap('lg', 'md')], etags })).status, 200);
    const session = json<EditState>((await get(EDITS)).text).session;
    assert.ok(session);
    // Still open: nothing to reopen.
    const open = await post(`${EDITS}/reopen`, session);
    assert.equal(open.status, 409);
    assert.equal(json<Problem>(open.text).code, 'EDIT_SESSION_TAKEN');

    await post(`${EDITS}/end`, {});
    assert.equal(json<EditState>((await get(EDITS)).text).session, null);
    const back = await post(`${EDITS}/reopen`, session);
    assert.equal(back.status, 200, back.text);
    assert.deepEqual(json<{ version: number; reopened: boolean }>(back.text), {
      version: 2,
      reopened: true,
    });
    assert.deepEqual(json<EditState>((await get(EDITS)).text).session, session);

    // Another version, started by anyone, ends the chance.
    await post(`${EDITS}/end`, {});
    addVersion(drafts, 'shop', NOW);
    const late = await post(`${EDITS}/reopen`, session);
    assert.equal(late.status, 409);

    const noOrigin = { ...auth, 'content-type': 'application/json' };
    assert.equal((await post(`${EDITS}/reopen`, session, noOrigin)).status, 403);
    const bad = await post(`${EDITS}/reopen`, { version: 0, startedAt: '' });
    assert.equal(bad.status, 422);
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('an edit of a version that is no longer the latest is refused as stale', async () => {
  const { studio, post } = await editStudio();
  try {
    const etags = { [TSX_FILE]: etagOf(PRICING_TSX) };
    const first = await post(EDITS, { version: 1, ops: [setGap('lg', 'md')], etags });
    assert.equal(first.status, 200, first.text);
    const stale = await post(EDITS, { version: 1, ops: [setGap('xl', 'lg')], etags });
    assert.equal(stale.status, 409);
    assert.equal(json<Problem>(stale.text).code, 'EDIT_STALE_VERSION');
  } finally {
    await studio.close();
  }
});

test("a write without the studio's Origin is refused, and so is an op on no source file", async () => {
  const { drafts, studio, auth, post } = await editStudio();
  try {
    const noOrigin = { ...auth, 'content-type': 'application/json' };
    const edit = { version: 1, ops: [setGap('lg', 'md')], etags: {} };
    assert.equal((await post(EDITS, edit, noOrigin)).status, 403);
    assert.equal((await post(`${EDITS}/end`, {}, noOrigin)).status, 403);
    const outside = await post(EDITS, {
      ...edit,
      ops: [{ ...setGap('lg', 'md'), id: '../x:div' }],
    });
    assert.equal(outside.status, 422);
    const problem = json<Problem>(outside.text);
    assert.equal(problem.code, 'BODY_INVALID');
    assert.equal(problem.errors?.[0]?.pointer, '/ops/0/id');
    assert.equal(drafts.exists('shop', 'v2'), false, 'nothing was written');
  } finally {
    await studio.close();
  }
});

test('the off-kit values of the latest version are listed', async () => {
  const { studio, errors, get } = await editStudio();
  try {
    const answer = await get('/api/v1/drafts/shop/off-kit');
    assert.equal(answer.status, 200, answer.text);
    const offKit = json<OffKit>(answer.text);
    assert.equal(offKit.version, 1);
    assert.deepEqual(
      offKit.items.map(({ file, className, property, value }) => ({
        file,
        className,
        property,
        value,
      })),
      [{ file: SCSS_FILE, className: 'pricing', property: 'margin', value: '13px' }],
    );
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('the API document lists the five edit routes', async () => {
  const { studio, get } = await editStudio();
  try {
    type Doc = { paths: Record<string, Record<string, { operationId: string }>> };
    const { paths } = json<Doc>((await get('/api/v1/openapi.json')).text);
    const base = '/api/v1/drafts/{slug}';
    assert.equal(paths[`${base}/edits`]?.get?.operationId, 'getEditState');
    assert.equal(paths[`${base}/edits`]?.post?.operationId, 'applyEdits');
    assert.equal(paths[`${base}/inspect`]?.get?.operationId, 'inspectElement');
    assert.equal(paths[`${base}/edits/end`]?.post?.operationId, 'endEditSession');
    assert.equal(paths[`${base}/edits/reopen`]?.post?.operationId, 'reopenEditSession');
    assert.equal(paths[`${base}/off-kit`]?.get?.operationId, 'listOffKit');
    assert.equal(paths[`${base}/text-source`]?.get?.operationId, 'checkTextSource');
  } finally {
    await studio.close();
  }
});

/** The pricing section with its plans in a `.map`, each name in a condition (ADR 0060). */
const LISTED_TSX = [
  "import { Stack, Text } from '@kit';",
  '',
  "const plans = [{ name: 'Free' }, { name: 'Pro' }];",
  '',
  'export function Pricing(_props: { state: string }) {',
  '  return (',
  '    <section className="pricing">',
  '      <Stack gap="md">',
  '        {plans.map((plan) => (',
  "          <Text key={plan.name}>{plan.name === 'Pro' ? 'Pro plan' : plan.name}</Text>",
  '        ))}',
  '      </Stack>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

test('text-source says whether one literal renders the text a copy shows', async () => {
  const { drafts, studio, errors, get } = await editStudio();
  drafts.writeText('shop', `v1/${TSX_FILE}`, LISTED_TSX);
  const id = encodeURIComponent(`${STACK}/Text`);
  const ask = async (query: string) => {
    const answer = await get(`/api/v1/drafts/shop/text-source?id=${id}&${query}`);
    assert.equal(answer.status, 200, answer.text);
    return json<TextSource>(answer.text).reason;
  };
  try {
    assert.equal(await ask('text=Pro%20plan&path=1'), null);
    assert.equal(await ask('text=Free&path=0'), null);
    assert.equal(await ask('text=Free&path=1'), 'computed');
    assert.equal(await ask('text=Free&path=0,1'), 'not-found');
    // The inspect answer names the list root the frame counts the copies by.
    const inspected = await get(`/api/v1/drafts/shop/inspect?id=${id}`);
    assert.deepEqual(json<Inspect>(inspected.text).expression, { roots: [`${STACK}/Text`] });
    // No path, no text, a path that is no list of places, no id.
    const queries = [`id=${id}&text=Free`, `id=${id}&path=0`, `id=${id}&text=a&path=x`];
    for (const query of [...queries, 'text=a&path=']) {
      const bad = await get(`/api/v1/drafts/shop/text-source?${query}`);
      assert.equal(bad.status, 400, query);
      assert.equal(json<Problem>(bad.text).code, 'REQUEST_INVALID', query);
    }
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a studio started without the editor still answers the state, but not inspect', async () => {
  const { studio, get } = await editStudio(false);
  try {
    assert.equal((await get(EDITS)).status, 200);
    const inspect = await get(`/api/v1/drafts/shop/inspect?id=${encodeURIComponent(STACK)}`);
    assert.equal(inspect.status, 500);
    assert.equal(json<Problem>(inspect.text).code, 'INTERNAL');
  } finally {
    await studio.close();
  }
});
