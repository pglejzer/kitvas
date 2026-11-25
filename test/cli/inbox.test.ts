import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createInboxCommand, runCli } from '../../src/cli/index.ts';
import { initWorkspace, PLUGIN_ROOT } from '../../src/shared/index.ts';
import type {
  InboxItem,
  InboxRequest,
  LifecycleDeps,
  StudioCaller,
} from '../../src/studio/index.ts';
import { fakeLifecycle } from '../helpers/fake-lifecycle.ts';
import { SAMPLE_STATE } from '../helpers/studio-state.ts';
import { tempDir } from '../helpers/tmp.ts';

/** A studio that answers every take with `answer`; the calls it got are kept. */
function fakeStudio(answer: { status: number; body: unknown }) {
  const calls: string[] = [];
  const call: StudioCaller = async (state, made) => {
    calls.push(`${made.method} ${made.path} ${JSON.stringify(made.body)} ${state.pid}`);
    return answer;
  };
  return { call, calls };
}

function harness(lifecycle: LifecycleDeps, call?: StudioCaller, workspace = true) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  if (workspace) {
    initWorkspace(io.cwd);
    writeFileSync(join(io.cwd, '.kitvas', 'decisions.md'), '---\nkit: tiny\n---\n');
  }
  const commands = [createInboxCommand({ lifecycle: () => lifecycle, call })];
  const run = (...argv: string[]) => runCli(argv, commands, io);
  const data = (): unknown => (JSON.parse(out.at(-1) ?? '') as { data: unknown }).data;
  return { out, err, run, data };
}

const note = (n: number, slug: string | null, element: string | null, text: string): InboxItem => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  at: '2026-11-22T10:00:00.000Z',
  kind: 'note',
  slug,
  element,
  text,
});

const NOTES = [
  note(1, 'shop', 'hero-title', 'Bigger title'),
  note(2, null, null, 'A darker studio'),
  note(3, 'shop', null, 'More space'),
];

const SAY_ID = '00000000-0000-4000-8000-000000000011';
const WHY_ID = '00000000-0000-4000-8000-000000000012';
const BUTTON = 'sections/Hero:section/Button';

const REQUESTS: InboxRequest[] = [
  { id: SAY_ID, slug: 'shop', kind: 'say', text: 'Make it stand out', elements: [BUTTON] },
  { id: WHY_ID, slug: 'shop', kind: 'why', text: '', elements: [] },
];

test('kitvas inbox prints the notes and the requests the studio handed over', async () => {
  const studio = fakeStudio({ status: 200, body: { items: NOTES, requests: REQUESTS } });
  const h = harness(fakeLifecycle({ running: SAMPLE_STATE }).deps, studio.call);
  assert.equal(await h.run('inbox'), 0);
  assert.equal(
    h.out.at(-1),
    [
      'Note on shop (hero-title): Bigger title',
      'Note: A darker studio',
      'Note on shop: More space',
      `Request ${SAY_ID} (say) on shop (${BUTTON}): Make it stand out`,
      `Request ${WHY_ID} (why) on shop.`,
    ].join('\n'),
  );
  assert.deepEqual(studio.calls, [`POST /api/v1/inbox/take {"timeout":30} ${SAMPLE_STATE.pid}`]);
  assert.equal(await h.run('inbox', '--timeout', '5', '--json'), 0);
  assert.deepEqual(h.data(), { running: true, items: NOTES, requests: REQUESTS });
  assert.equal(studio.calls.at(-1), `POST /api/v1/inbox/take {"timeout":5} ${SAMPLE_STATE.pid}`);
});

test('a studio of an older version hands notes only', async () => {
  const studio = fakeStudio({ status: 200, body: { items: NOTES } });
  const h = harness(fakeLifecycle({ running: SAMPLE_STATE }).deps, studio.call);
  assert.equal(await h.run('inbox', '--json'), 0);
  assert.deepEqual(h.data(), { running: true, items: NOTES, requests: [] });
});

test('nothing new, no studio, a wrong timeout, no workspace', async () => {
  const quiet = fakeStudio({ status: 200, body: { items: [], requests: [] } });
  const empty = harness(fakeLifecycle({ running: SAMPLE_STATE }).deps, quiet.call);
  assert.equal(await empty.run('inbox', '--timeout', '0'), 0);
  assert.equal(empty.out.at(-1), 'No new notes or requests from the studio.');
  const none = harness(fakeLifecycle().deps, quiet.call);
  assert.equal(await none.run('inbox'), 0);
  assert.equal(none.out.at(-1), 'No studio runs for this project.');
  assert.equal(await none.run('inbox', '--json'), 0);
  assert.deepEqual(none.data(), { running: false, items: [], requests: [] });
  assert.equal(await none.run('inbox', '--timeout', '601'), 2);
  assert.equal(await none.run('inbox', '--timeout', 'soon'), 2);
  assert.equal(await harness(fakeLifecycle().deps, quiet.call, false).run('inbox'), 13);
  assert.deepEqual(quiet.calls.length, 1);
});

test('a take the studio refuses is an error with its code and words', async () => {
  const refused = fakeStudio({
    status: 503,
    body: { code: 'STREAM_LIMIT', detail: 'Too many tabs.' },
  });
  const h = harness(fakeLifecycle({ running: SAMPLE_STATE }).deps, refused.call);
  assert.equal(await h.run('inbox', '--json'), 1);
  const error = (JSON.parse(h.err.at(-1) ?? '') as { error: { code: string; message: string } })
    .error;
  assert.equal(error.code, 'INTERNAL');
  assert.match(error.message, /503 STREAM_LIMIT: Too many tabs\./);
});
